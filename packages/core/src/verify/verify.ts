import type { Change, EvidenceExample, UnattributedFailure } from "@drift/report-schema";
import type { ErrorObject } from "ajv/dist/2020.js";
import { canonicalJson } from "../hash/canonical-json.ts";
import type { Anchor, Slot } from "../diff/anchors.ts";
import type { DiffResult } from "../diff/diff.ts";
import type { NormalizedSchema, OperationIR, SpecIR } from "../ingest/ir.ts";
import { isJsonMediaType, mediaTypeOf, requestPayload, responsePayload, type RoutedSample } from "../corpus/sample.ts";
import { FAIL, RecordingPlan, SchemaGenerator, synthesizeRequest, type ChoicePlan } from "../corpus/synthesize.ts";
import { escapeToken, getAtTokens, parsePointer } from "../util/json-pointer.ts";
import type { JsonObject, JsonValue } from "../util/json.ts";
import { explains, type Failure } from "./attribution.ts";
import { Validators } from "./validators.ts";
import { fromWire } from "./wire.ts";

export interface VerifyOptions {
  /** Rotates the synthetic sweep (deterministic). */
  seed: number;
  /** Failing samples kept per change. */
  maxExamples: number;
  /** Synthetic samples generated per operation (requests) or per response status and media type. */
  syntheticPerGroup: number;
  /**
   * Synthetic samples for the whole comparison, shared out evenly between the groups that need them. When a change
   * reaches many operations (a shared component), each group gets fewer broad-coverage samples; the samples aimed
   * at the changed nodes always run. Counted in samples, not time, so reports stay deterministic.
   */
  syntheticBudget: number;
}

export const DEFAULT_VERIFY_OPTIONS: VerifyOptions = {
  seed: 0,
  maxExamples: 3,
  syntheticPerGroup: 48,
  syntheticBudget: 4096,
};

export interface Counts {
  recorded: number;
  synthetic: number;
}

export interface Evidence {
  checked: Counts;
  failed: Counts;
  unknown: number;
  examples: EvidenceExample[];
}

/** Stage 4 output (PLAN §4.4). */
export interface VerifyResult {
  /** Change id → evidence. Every change has an entry. */
  evidence: Record<string, Evidence>;
  unattributed: UnattributedFailure[];
  nonConformance: { requests: number; responses: number };
  synthetic: { generated: number; discarded: number };
  /** How the synthetic budget was shared: groups that needed samples, the limit each got, and how many hit it. */
  budget: { groups: number; perGroup: number; trimmed: number };
  /** Validators compiled per contract (each at most once per cache key). */
  compiled: { base: number; head: number };
  /** Parts of a contract that could not be checked, e.g. a `pattern` that is not a valid regular expression. */
  notes: string[];
}

const IGNORED_HEADERS = new Set(["accept", "content-type", "authorization"]);
/** Keywords whose result depends on the values below the failing location (so on redacted values too). */
const VALUE_DEPENDENT = new Set([
  "oneOf",
  "anyOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "contains",
  "uniqueItems",
  "enum",
  "const",
  "dependentSchemas",
  "unevaluatedProperties",
  "unevaluatedItems",
]);

/**
 * A failure is unknown when it is at a redacted value, inside one, or (for keywords that look at nested values)
 * above one: redaction changed the value, so the failure may be an artefact (risk R6). Unknown is never failing.
 */
function isUnknown(failure: Failure, redacted: readonly string[]): boolean {
  const { pointer } = failure;
  if (pointer.startsWith("/cookies/") && redacted.includes("/headers/cookie")) return true;
  return redacted.some(
    (r) =>
      pointer === r ||
      pointer.startsWith(`${r}/`) ||
      (VALUE_DEPENDENT.has(failure.keyword) && r.startsWith(`${pointer}/`))
  );
}

/** Media type keys of a contract matched against a Content-Type: exact, then `type/*`, then `*` + `/*`. */
function matchMedia(contentType: string, keys: readonly string[]): string | undefined {
  const bare = (key: string) => mediaTypeOf(key) ?? key;
  const [type] = contentType.split("/");
  return (
    keys.find((key) => bare(key) === contentType) ??
    keys.find((key) => bare(key) === `${type ?? ""}/*`) ??
    keys.find((key) => bare(key) === "*/*")
  );
}

function responseKey(status: number, responses: Record<string, unknown>): string | undefined {
  const exact = String(status);
  const range = `${exact.charAt(0)}XX`;
  return [exact, range, range.toLowerCase(), "default"].find((key) => key in responses);
}

function parseCookies(header: readonly string[] | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const line of header ?? []) {
    for (const part of line.split(";")) {
      const index = part.indexOf("=");
      if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
  }
  return cookies;
}

function schemaFailures(errors: ErrorObject[], slot: Slot, prefix: string): Failure[] {
  return errors.map((error) => {
    const source: unknown = error.parentSchema?.$source;
    let pointer = `${prefix}${error.instancePath}`;
    const params = error.params as Record<string, unknown>;
    if (error.keyword === "required") pointer += `/${escapeToken(String(params.missingProperty))}`;
    if (error.keyword === "additionalProperties") pointer += `/${escapeToken(String(params.additionalProperty))}`;
    return {
      at: "schema",
      slot,
      node: typeof source === "string" ? source : "#",
      keyword: error.keyword,
      params,
      value: error.data,
      pointer,
      message: error.message ?? error.keyword,
    };
  });
}

/** Checks requests and responses against one contract. */
export class Checker {
  readonly validators: Validators;
  readonly #spec: SpecIR;

  constructor(spec: SpecIR) {
    this.#spec = spec;
    this.validators = new Validators(spec);
  }

  #validate(
    key: string,
    direction: "request" | "response",
    schema: NormalizedSchema,
    value: JsonValue,
    slot: Slot,
    prefix: string
  ) {
    const validate = this.validators.get(direction, key, schema);
    if (!validate) return [];
    const result = validate(value);
    return result.valid ? [] : schemaFailures(result.errors, slot, prefix);
  }

  /** Failures of a request, and the media type key its body matched (if any). */
  request(sample: RoutedSample, operation: OperationIR | undefined, baseMediaType?: string) {
    if (!operation) {
      const failure: Failure = {
        at: "operation",
        pointer: "/operation",
        keyword: "operation",
        message: `${sample.operation} is not in this contract`,
      };
      return { failures: [failure], mediaType: undefined };
    }
    const failures: Failure[] = [];
    const cookies = parseCookies(sample.headers.cookie);
    for (const [key, param] of Object.entries(operation.parameters)) {
      if (param.in === "header" && IGNORED_HEADERS.has(param.name.toLowerCase())) continue;
      let raw: string[] | undefined;
      let pointer: string;
      if (param.in === "path") {
        const index = Number(key.slice("path:".length));
        raw = sample.pathParams[index] === undefined ? undefined : [sample.pathParams[index] ?? ""];
        pointer = `/path/${String(index)}`;
      } else if (param.in === "query") {
        raw = sample.query[param.name];
        pointer = `/query/${escapeToken(param.name)}`;
      } else if (param.in === "header") {
        raw = sample.headers[param.name.toLowerCase()];
        pointer = `/headers/${escapeToken(param.name.toLowerCase())}`;
      } else {
        const value = cookies[param.name];
        raw = value === undefined ? undefined : [value];
        pointer = `/cookies/${escapeToken(param.name)}`;
      }
      if (raw === undefined || raw.length === 0) {
        if (param.required) {
          failures.push({
            at: "param",
            key,
            pointer,
            keyword: "required",
            message: `required ${param.in} parameter "${param.name}" is missing`,
          });
        }
        continue;
      }
      const value = fromWire(raw, param.schema, this.#spec);
      failures.push(
        ...this.#validate(
          `${operation.key}|param:${key}`,
          "request",
          param.schema,
          value,
          { part: "param", key },
          pointer
        )
      );
    }

    const body = operation.requestBody;
    let mediaType: string | undefined;
    if (body) {
      if (!sample.body) {
        if (body.required) {
          failures.push({ at: "body", pointer: "/body", keyword: "required", message: "request body is required" });
        }
      } else {
        mediaType = matchMedia(sample.body.contentType, Object.keys(body.content));
        const media = mediaType === undefined ? undefined : body.content[mediaType];
        if (mediaType === undefined || !media) {
          failures.push({
            at: "media",
            mediaType: baseMediaType ?? sample.body.contentType,
            pointer: "/headers/content-type",
            keyword: "mediaType",
            message: `media type ${sample.body.contentType} is not accepted`,
          });
        } else if (
          media.schema &&
          (isJsonMediaType(sample.body.contentType) || sample.body.contentType.startsWith("text/"))
        ) {
          failures.push(
            ...this.#validate(
              `${operation.key}|body:${mediaType}`,
              "request",
              media.schema,
              sample.body.value,
              { part: "body", mediaType },
              "/body"
            )
          );
        }
      }
    }
    return { failures, mediaType };
  }

  /** Failures of a response body against the response for `status` and `mediaType`. */
  response(operation: OperationIR, status: string, mediaType: string, value: JsonValue, prefix: string): Failure[] {
    const schema = operation.responses[status]?.content[mediaType]?.schema;
    if (!schema) return [];
    return this.#validate(
      `${operation.key}|response:${status}:${mediaType}`,
      "response",
      schema,
      value,
      { part: "response", status, mediaType },
      prefix
    );
  }
}

interface Group {
  operation: string;
  direction: "request" | "response";
  changes: { change: Change; anchors: Anchor[] }[];
}

/**
 * Stage 4 — Verify (PLAN §4.4, ADR-0002).
 *
 * - Request direction: a sample is evidence for a change only if the **old** contract accepts it and the **new**
 *   one rejects it for a reason that change explains. Recorded samples come from the corpus; operations no
 *   recorded sample reached get synthetic samples generated from the old contract.
 * - Response direction: samples are generated from the **new** response schema and validated against the
 *   **old** one; a rejection is evidence that clients built on the old contract may reject new responses.
 *   Recorded responses are checked against the new contract for information only (non-conformance).
 * - Failures at redacted values are unknown, never failing. Failures no change explains are reported as
 *   unattributed, so a gap in the diff is visible instead of hidden.
 */
export function verify(
  base: SpecIR,
  head: SpecIR,
  diff: DiffResult,
  recorded: readonly RoutedSample[],
  options: VerifyOptions = DEFAULT_VERIFY_OPTIONS
): VerifyResult {
  const baseChecker = new Checker(base);
  const headChecker = new Checker(head);
  const evidence: Record<string, Evidence> = {};
  const byId = new Map(diff.changes.map((change) => [change.id, change]));
  for (const change of diff.changes) {
    evidence[change.id] = {
      checked: { recorded: 0, synthetic: 0 },
      failed: { recorded: 0, synthetic: 0 },
      unknown: 0,
      examples: [],
    };
  }
  const unattributed = new Map<string, UnattributedFailure>();
  const result: VerifyResult = {
    evidence,
    unattributed: [],
    nonConformance: { requests: 0, responses: 0 },
    synthetic: { generated: 0, discarded: 0 },
    budget: { groups: 0, perGroup: options.syntheticPerGroup, trimmed: 0 },
    compiled: { base: 0, head: 0 },
    notes: [],
  };

  const groups = new Map<string, Group>();
  for (const [operation, ids] of Object.entries(diff.impact)) {
    for (const id of ids) {
      const change = byId.get(id);
      if (!change) continue;
      const key = `${operation}\0${change.direction}`;
      const group = groups.get(key) ?? { operation, direction: change.direction, changes: [] };
      group.changes.push({ change, anchors: diff.anchors[id] ?? [] });
      groups.set(key, group);
    }
  }

  const record = (
    group: Group,
    sample: RoutedSample,
    failures: Failure[],
    reached: (anchor: Anchor) => boolean,
    side: "base" | "head",
    payload: JsonObject,
    redacted: readonly string[]
  ) => {
    const real = failures.filter((failure) => !isUnknown(failure, redacted));
    const unknown = failures.filter((failure) => isUnknown(failure, redacted));
    let explainedAny = false;
    for (const { change, anchors } of group.changes) {
      if (!anchors.some(reached)) continue;
      const entry = evidence[change.id];
      if (!entry) continue;
      entry.checked[sample.origin === "recorded" ? "recorded" : "synthetic"]++;
      const mine = real.filter((failure) => anchors.some((anchor) => explains(change, anchor, failure, side)));
      if (mine.length > 0) {
        explainedAny = true;
        entry.failed[sample.origin === "recorded" ? "recorded" : "synthetic"]++;
        if (entry.examples.length < options.maxExamples) {
          entry.examples.push(example(sample, payload, redacted, mine));
        }
      } else if (unknown.some((failure) => anchors.some((anchor) => explains(change, anchor, failure, side)))) {
        entry.unknown++;
      }
    }
    if (real.length > 0 && !explainedAny) {
      const key = `${group.operation}\0${group.direction}`;
      const existing = unattributed.get(key);
      if (existing) existing.count++;
      else {
        unattributed.set(key, {
          operation: group.operation,
          direction: group.direction,
          count: 1,
          example: example(sample, payload, redacted, real),
        });
      }
    }
  };

  const checkRequest = (group: Group, sample: RoutedSample) => {
    const old = baseChecker.request(sample, base.operations[sample.operation]);
    if (old.failures.some((failure) => !isUnknown(failure, sample.redacted))) {
      if (sample.origin === "recorded") result.nonConformance.requests++;
      return false;
    }
    const now = headChecker.request(sample, head.operations[sample.operation], old.mediaType);
    const reached = (anchor: Anchor): boolean => {
      switch (anchor.at) {
        case "media":
          return anchor.part === "body" && old.mediaType === anchor.mediaType;
        case "schema":
          if (anchor.slot.part === "body") return old.mediaType === anchor.slot.mediaType;
          if (anchor.slot.part === "param") return paramPresent(sample, anchor.slot.key);
          return false;
        case "status":
          return false;
        default:
          return true;
      }
    };
    record(group, sample, now.failures, reached, "head", requestPayload(sample), sample.redacted);
    return true;
  };

  let syntheticId = 0;
  // Work is planned first and run afterwards, in the same order, so the budget can be shared out before any
  // synthetic sample is generated. `start` creates a group's generator (and its state) only when the group runs.
  const steps: ((limit: number) => void)[] = [];
  const synthesize = (focus: string[], steer: Steer, start: () => (plan: ChoicePlan) => void) => {
    result.budget.groups++;
    steps.push((limit) => {
      if (runPlans(focus, options, limit, start(), steer)) result.budget.trimmed++;
    });
  };
  const sortedGroups = [...groups.values()].sort((a, b) =>
    a.operation < b.operation ? -1 : a.operation > b.operation ? 1 : a.direction < b.direction ? -1 : 1
  );
  const recordedByOperation = new Map<string, RoutedSample[]>();
  for (const sample of recorded) {
    const list = recordedByOperation.get(sample.operation) ?? [];
    list.push(sample);
    recordedByOperation.set(sample.operation, list);
  }

  for (const group of sortedGroups) {
    const baseOperation = base.operations[group.operation];
    const headOperation = head.operations[group.operation];
    if (group.direction === "request") {
      const samples = recordedByOperation.get(group.operation) ?? [];
      steps.push(() => {
        for (const sample of samples) checkRequest(group, sample);
      });
      if (samples.length === 0 && baseOperation) {
        const focus = group.changes.flatMap(({ anchors }) => anchors.map(requestFocus));
        const steer: Steer = (targets) => {
          const generator = new SchemaGenerator(base, "request", { pick: () => 0 });
          const schemas = [
            ...Object.values(baseOperation.parameters).map((param) => param.schema),
            ...Object.values(baseOperation.requestBody?.content ?? {}).map((media) => media.schema),
          ];
          return new Map(schemas.flatMap((schema) => [...generator.routes(schema, targets)]));
        };
        synthesize(focus, steer, () => {
          const seen = new Set<string>();
          return (plan) => {
            const sample = synthesizeRequest(base, baseOperation, plan, `s:${String(syntheticId + 1)}`);
            if (sample === FAIL) return;
            const key = canonicalJson(requestPayload(sample));
            if (seen.has(key)) return;
            seen.add(key);
            syntheticId++;
            if (checkRequest(group, sample)) result.synthetic.generated++;
            else result.synthetic.discarded++;
          };
        });
      }
    } else if (baseOperation && headOperation) {
      checkResponses(group, baseOperation, headOperation);
    }
  }

  function checkResponses(group: Group, baseOperation: OperationIR, headOperation: OperationIR) {
    for (const status of Object.keys(headOperation.responses).sort()) {
      const baseResponse = baseOperation.responses[status];
      const headResponse = headOperation.responses[status];
      if (!baseResponse || !headResponse) continue;
      for (const mediaType of Object.keys(headResponse.content).sort()) {
        const headSchema = headResponse.content[mediaType]?.schema;
        const baseSchema = baseResponse.content[mediaType]?.schema;
        if (!headSchema || !baseSchema || !isJsonMediaType(mediaType)) continue;
        const slotChanges = group.changes.filter(({ anchors }) =>
          anchors.some(
            (anchor) =>
              anchor.at === "schema" &&
              anchor.slot.part === "response" &&
              anchor.slot.status === status &&
              anchor.slot.mediaType === mediaType
          )
        );
        if (slotChanges.length === 0) continue;
        const focus = slotChanges.flatMap(({ anchors }) =>
          anchors.flatMap((anchor) => (anchor.at === "schema" ? [anchor.nodes.head] : []))
        );
        const steer: Steer = (targets) =>
          new SchemaGenerator(head, "response", { pick: () => 0 }).routes(headSchema, targets);
        synthesize(focus, steer, () => {
          const seen = new Set<string>();
          return (plan) => {
            const value = new SchemaGenerator(head, "response", plan).generate(headSchema);
            if (value === FAIL) return;
            const key = canonicalJson(value);
            if (seen.has(key)) return;
            seen.add(key);
            syntheticId++;
            if (headChecker.response(headOperation, status, mediaType, value, "/body").length > 0) {
              result.synthetic.discarded++;
              return;
            }
            result.synthetic.generated++;
            const sample: RoutedSample = {
              id: `s:${String(syntheticId)}`,
              origin: "synthetic",
              method: headOperation.method.toUpperCase(),
              path: headOperation.path,
              query: {},
              headers: {},
              redacted: [],
              operation: group.operation,
              pathParams: [],
              response: { status: Number(status) || 200, headers: {}, body: { contentType: mediaType, value } },
            };
            const failures = baseChecker.response(baseOperation, status, mediaType, value, "/body");
            const reached = (anchor: Anchor) =>
              anchor.at === "schema" &&
              anchor.slot.part === "response" &&
              anchor.slot.status === status &&
              anchor.slot.mediaType === mediaType;
            record(group, sample, failures, reached, "base", responsePayload(sample), []);
          };
        });
      }
    }
  }

  const { groups: planned } = result.budget;
  const limit = Math.min(options.syntheticPerGroup, Math.floor(options.syntheticBudget / Math.max(1, planned)));
  result.budget.perGroup = limit;
  for (const step of steps) step(limit);

  // Recorded responses: checked against the new contract, for information only.
  for (const sample of recorded) {
    const operation = head.operations[sample.operation];
    const response = sample.response;
    if (!operation || !response?.body) continue;
    const status = responseKey(response.status, operation.responses);
    const content = status === undefined ? undefined : operation.responses[status]?.content;
    const mediaType = content ? matchMedia(response.body.contentType, Object.keys(content)) : undefined;
    if (status === undefined || mediaType === undefined || !isJsonMediaType(response.body.contentType)) continue;
    const failures = headChecker.response(operation, status, mediaType, response.body.value, "/response/body");
    if (failures.some((failure) => !isUnknown(failure, sample.redacted))) result.nonConformance.responses++;
  }

  result.unattributed = [...unattributed.values()];
  result.compiled = { base: baseChecker.validators.compiled, head: headChecker.validators.compiled };
  for (const [label, checker] of [
    ["old", baseChecker],
    ["new", headChecker],
  ] as const) {
    for (const [key, reason] of checker.validators.failures) {
      result.notes.push(`${label} contract: ${key.replace("\0", " ")} could not be checked (${reason})`);
    }
  }
  return result;
}

/** Bodies larger than this (UTF-8 bytes of canonical JSON) are left out of report examples. */
const MAX_EXAMPLE_BODY_BYTES = 8192;
/** Values at error pointers kept from an omitted body, when no larger than this. */
const MAX_EXAMPLE_VALUE_BYTES = 1024;

function utf8Bytes(value: JsonValue): number {
  return new TextEncoder().encode(canonicalJson(value)).length;
}

/**
 * A failing sample as shown in reports. A large body is replaced by its size and the values at the failing
 * pointers: a change to a component shared by hundreds of operations would otherwise put hundreds of full
 * generated responses (over 100 KB each on Stripe) into the report and its PR comment.
 */
function example(
  sample: RoutedSample,
  payload: JsonObject,
  redacted: readonly string[],
  failures: readonly Failure[]
): EvidenceExample {
  const errors = failures.map(({ pointer, keyword, message }) => ({ pointer, keyword, message }));
  const shown: EvidenceExample = {
    sample: sample.id,
    origin: sample.origin,
    ...(sample.line === undefined ? {} : { line: sample.line }),
    payload,
    redacted: [...redacted],
    errors,
  };
  const body = payload.body;
  if (body === undefined) return shown;
  const bytes = utf8Bytes(body);
  if (bytes <= MAX_EXAMPLE_BODY_BYTES) return shown;
  const values: JsonObject = {};
  for (const { pointer } of errors) {
    const tokens = parsePointer(pointer);
    if (tokens?.[0] !== "body") continue;
    const found = getAtTokens(payload, tokens);
    if (found.found && utf8Bytes(found.value) <= MAX_EXAMPLE_VALUE_BYTES) values[pointer] = found.value;
  }
  return {
    ...shown,
    payload: Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "body")),
    bodyOmitted: { bytes, values },
  };
}

function paramPresent(sample: RoutedSample, key: string): boolean {
  const [location, name] = splitOnce(key, ":");
  if (location === "path") return sample.pathParams[Number(name)] !== undefined;
  if (location === "query") return sample.query[name] !== undefined;
  if (location === "header") return sample.headers[name] !== undefined;
  return parseCookies(sample.headers.cookie)[name] !== undefined;
}

function splitOnce(text: string, separator: string): [string, string] {
  const index = text.indexOf(separator);
  return index === -1 ? [text, ""] : [text.slice(0, index), text.slice(index + 1)];
}

/** The generator decision a request-direction anchor depends on. */
function requestFocus(anchor: Anchor): string {
  switch (anchor.at) {
    case "param":
      return `param:${anchor.key}`;
    case "body":
      return "body";
    case "media":
      return "media";
    case "schema":
      return anchor.nodes.base;
    default:
      return "operation";
  }
}

const MAX_SWEEPS = 12;

/** Directions towards target schema nodes (see SchemaGenerator.routes). */
type Steer = (targets: ReadonlySet<string>) => Map<string, number>;

/**
 * Runs generation plans for one group:
 *
 * 1. a baseline (the first variant everywhere, rotated by the seed), and, if it misses a focus point (a node a
 *    change touches), a plan steered towards the missed points;
 * 2. for each focus point, every other variant of that point, with everything else as in the first plan that
 *    reached it;
 * 3. sweeps in which every decision takes variant `round` (modulo its number of variants);
 * 4. a fill: every variant not yet taken at any point reached so far, in the same way as step 2.
 *
 * Steps 1 and 2 are the change-directed samples and stop at `syntheticPerGroup`; steps 3 and 4 add coverage and
 * stop at `limit` (the group's share of the budget). Steps 2 and 4 make sure each variant of each node that was
 * reached is generated at least once (within the cap), which the sweeps alone do not: a sweep that omits an
 * optional property never reaches that property's node. Returns whether `limit` cut steps 3 and 4 short.
 */
function runPlans(
  focus: readonly string[],
  options: VerifyOptions,
  limit: number,
  generate: (plan: ChoicePlan) => void,
  steer: Steer
): boolean {
  const plans: RecordingPlan[] = [];
  const taken = new Map<string, Set<number>>();
  let cap = options.syntheticPerGroup;
  let trimmed = false;
  const run = (strategy: (point: string, choices: number) => number) => {
    if (plans.length >= cap) {
      if (plans.length < options.syntheticPerGroup) trimmed = true;
      return;
    }
    const plan = new RecordingPlan(strategy);
    generate(plan);
    plans.push(plan);
    for (const [point, { picked }] of plan.seen) {
      const set = taken.get(point) ?? new Set<number>();
      set.add(picked);
      taken.set(point, set);
    }
  };
  const vary = (point: string) => {
    const home = plans.find((plan) => plan.seen.has(point));
    const seen = home?.seen.get(point);
    if (!home || !seen) return;
    for (let choice = 0; choice < seen.choices; choice++) {
      if (taken.get(point)?.has(choice)) continue;
      run((other) => (other === point ? choice : (home.seen.get(other)?.picked ?? 0)));
    }
  };
  run((_, choices) => options.seed % choices);
  const missed = new Set(focus.filter((point) => !plans.some((plan) => plan.seen.has(point))));
  if (missed.size > 0) {
    const routes = steer(missed);
    if (routes.size > 0) run((point) => routes.get(point) ?? 0);
  }
  for (const point of [...new Set(focus)].sort()) vary(point);
  cap = Math.min(cap, limit);
  const widest = () => Math.max(1, ...plans.flatMap((plan) => [...plan.seen.values()].map((seen) => seen.choices)));
  for (let round = 1; round < widest() && round < MAX_SWEEPS; round++) {
    run((_, choices) => (round + options.seed) % choices);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const point of [...taken.keys()].sort()) vary(point);
  }
  return trimmed;
}

export { isUnknown, matchMedia, responseKey };
