import type { Change, ChangeKind, Direction } from "@drift/report-schema";
import { candidateSeverity } from "@drift/rules";
import { canonicalJson } from "../hash/canonical-json.ts";
import { sha256Hex } from "../hash/content-hash.ts";
import type {
  MediaTypeIR,
  NormalizedSchema,
  OperationIR,
  ParameterIR,
  RequestBodyIR,
  ResponseIR,
  SecurityRequirementIR,
  SpecIR,
} from "../ingest/ir.ts";
import type { JsonValue } from "../util/json.ts";
import { SchemaDiffer, type SchemaChange } from "./schema-diff.ts";

/** Stage 2 output: every structural change, and which operations each change affects. */
export interface DiffResult {
  changes: Change[];
  /** Impact index: operation key → ids of the changes that affect it. Later stages only touch these operations. */
  impact: Record<string, string[]>;
}

interface ChangeInput {
  kind: ChangeKind;
  direction: Direction;
  operation: string;
  location: string;
  side: "base" | "head";
  subject?: string | undefined;
  before?: JsonValue | undefined;
  after?: JsonValue | undefined;
  message: string;
}

/** Stable change id: the first 16 hex digits of SHA-256 over what identifies the change. */
export function changeId(
  input: Pick<ChangeInput, "kind" | "direction" | "operation" | "location" | "subject">
): string {
  const identity = {
    kind: input.kind,
    direction: input.direction,
    operation: input.operation,
    location: input.location,
    subject: input.subject ?? null,
  };
  return sha256Hex(canonicalJson(identity)).slice(0, 16);
}

function makeChange(input: ChangeInput): Change {
  const change: Change = {
    id: changeId(input),
    kind: input.kind,
    direction: input.direction,
    operation: input.operation,
    location: input.location,
    side: input.side,
    candidateSeverity: candidateSeverity(input.kind, input.direction),
    message: input.message,
  };
  if (input.subject !== undefined) change.subject = input.subject;
  if (input.before !== undefined) change.before = input.before;
  if (input.after !== undefined) change.after = input.after;
  return change;
}

/**
 * Stage 2 — Diff (PLAN §4.2). Compares two IRs operation by operation. Operations are matched by their
 * normalised key (`GET /users/{}`), so renaming a path parameter is a rename, not a removal plus an addition.
 * Deterministic: the same inputs always produce the same changes in the same order.
 */
export function diffSpecs(base: SpecIR, head: SpecIR): DiffResult {
  const differ = new SchemaDiffer(base, head);
  const changes = new Map<string, Change>();
  const add = (input: ChangeInput) => {
    const change = makeChange(input);
    if (!changes.has(change.id)) changes.set(change.id, change);
  };

  const baseTemplates = new Set(Object.values(base.operations).map((operation) => operation.template));
  const headTemplates = new Set(Object.values(head.operations).map((operation) => operation.template));
  const keys = [...new Set([...Object.keys(base.operations), ...Object.keys(head.operations)])].sort();
  for (const key of keys) {
    const before = base.operations[key];
    const after = head.operations[key];
    if (before && after) {
      new OperationDiff(key, before, after, differ, add).run();
    } else if (before) {
      const wholePath = !headTemplates.has(before.template);
      add({
        kind: wholePath ? "path.removed" : "operation.removed",
        direction: "request",
        operation: key,
        location: before.source,
        side: "base",
        message: wholePath ? `Path ${before.path} was removed` : `Operation ${key} was removed`,
      });
    } else if (after) {
      const wholePath = !baseTemplates.has(after.template);
      add({
        kind: wholePath ? "path.added" : "operation.added",
        direction: "request",
        operation: key,
        location: after.source,
        side: "head",
        message: wholePath ? `Path ${after.path} was added` : `Operation ${key} was added`,
      });
    }
  }

  const sorted = [...changes.values()].sort(
    (a, b) =>
      compare(a.operation, b.operation) ||
      compare(a.direction, b.direction) ||
      compare(a.location, b.location) ||
      compare(a.kind, b.kind) ||
      compare(a.subject ?? "", b.subject ?? "")
  );
  const impact: Record<string, string[]> = {};
  for (const change of sorted) (impact[change.operation] ??= []).push(change.id);
  return { changes: sorted, impact };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

class OperationDiff {
  readonly #key: string;
  readonly #base: OperationIR;
  readonly #head: OperationIR;
  readonly #differ: SchemaDiffer;
  readonly #add: (input: ChangeInput) => void;

  constructor(
    key: string,
    base: OperationIR,
    head: OperationIR,
    differ: SchemaDiffer,
    add: (input: ChangeInput) => void
  ) {
    this.#key = key;
    this.#base = base;
    this.#head = head;
    this.#differ = differ;
    this.#add = add;
  }

  run(): void {
    const b = this.#base;
    const h = this.#head;
    b.pathParams.forEach((name, index) => {
      const renamed = h.pathParams[index];
      if (renamed !== undefined && renamed !== name) {
        this.#emit("path.param.renamed", "request", h.source, "head", {
          subject: String(index),
          before: name,
          after: renamed,
          message: `Path parameter {${name}} renamed to {${renamed}} (names are not sent on the wire)`,
        });
      }
    });
    if (!b.deprecated && h.deprecated) {
      this.#emit("operation.deprecated", "request", `${h.source}/deprecated`, "head", {
        message: `${this.#key} is now deprecated`,
      });
    }
    for (const field of ["summary", "description"] as const) {
      if (b[field] !== h[field]) {
        this.#emit("doc.changed", "request", `${h.source}/${field}`, "head", {
          subject: field,
          message: `Operation ${field} changed`,
        });
      }
    }
    this.#security(b.security, h.security);
    this.#parameters(b.parameters, h.parameters);
    this.#requestBody(b.requestBody, h.requestBody);
    this.#responses(b.responses, h.responses);
  }

  #emit(
    kind: ChangeKind,
    direction: Direction,
    location: string,
    side: "base" | "head",
    extra: { message: string; subject?: string; before?: JsonValue; after?: JsonValue }
  ): void {
    this.#add({ kind, direction, operation: this.#key, location, side, ...extra });
  }

  #schemas(b: NormalizedSchema, h: NormalizedSchema, direction: Direction, context: string): void {
    for (const change of this.#differ.diff(b, h, direction)) this.#emitSchema(change, direction, context);
  }

  #emitSchema(change: SchemaChange, direction: Direction, context: string): void {
    const side = direction === "request" ? "Request" : "Response";
    this.#emit(change.kind, direction, change.location, change.side, {
      message: `${side} ${context}: ${change.message}`,
      ...(change.subject === undefined ? {} : { subject: change.subject }),
      ...(change.before === undefined ? {} : { before: change.before }),
      ...(change.after === undefined ? {} : { after: change.after }),
    });
  }

  /** Security alternatives: the change is tightening if some way of calling that used to work no longer does. */
  #security(b: SecurityRequirementIR[], h: SecurityRequirementIR[]): void {
    if (canonicalJson(b) === canonicalJson(h)) return;
    const alternatives = (list: SecurityRequirementIR[]) => (list.length === 0 ? [{}] : list);
    const satisfies = (requirement: SecurityRequirementIR, offered: SecurityRequirementIR) =>
      Object.entries(requirement).every(([scheme, scopes]) => {
        const available = offered[scheme];
        return available !== undefined && scopes.every((scope) => available.includes(scope));
      });
    const stillWorks = alternatives(b).every((old) => alternatives(h).some((now) => satisfies(now, old)));
    this.#emit(
      stillWorks ? "security.requirement.removed" : "security.requirement.added",
      "request",
      `${this.#head.source}/security`,
      "head",
      {
        before: b,
        after: h,
        message: stillWorks ? "Security requirements were relaxed" : "Security requirements were tightened",
      }
    );
  }

  #parameters(b: Record<string, ParameterIR>, h: Record<string, ParameterIR>): void {
    const removed = Object.entries(b).filter(([key]) => !(key in h));
    const added = new Map(Object.entries(h).filter(([key]) => !(key in b)));
    for (const [key, before] of removed) {
      // Same name, different location (not for path parameters, which are matched by position).
      const moved = [...added].find(
        ([, after]) =>
          after.in !== before.in && before.in !== "path" && after.name.toLowerCase() === before.name.toLowerCase()
      );
      if (moved) {
        const [movedKey, after] = moved;
        added.delete(movedKey);
        this.#emit("param.location_changed", "request", after.source, "head", {
          subject: before.name,
          before: before.in,
          after: after.in,
          message: `Parameter "${before.name}" moved from ${before.in} to ${after.in}`,
        });
        continue;
      }
      this.#emit("param.removed", "request", before.source, "base", {
        subject: key,
        message: `${capitalise(before.in)} parameter "${before.name}" was removed`,
      });
    }
    for (const [key, after] of added) {
      this.#emit(after.required ? "param.added.required" : "param.added.optional", "request", after.source, "head", {
        subject: key,
        message: `${after.required ? "Required" : "Optional"} ${after.in} parameter "${after.name}" was added`,
      });
    }
    for (const [key, before] of Object.entries(b)) {
      const after = h[key];
      if (!after) continue;
      const label = `${after.in} parameter "${after.name}"`;
      if (!before.required && after.required) {
        this.#emit("param.made_required", "request", after.source, "head", {
          subject: key,
          message: `${capitalise(label)} is now required`,
        });
      } else if (before.required && !after.required) {
        this.#emit("param.made_optional", "request", after.source, "head", {
          subject: key,
          message: `${capitalise(label)} is no longer required`,
        });
      }
      if (!before.deprecated && after.deprecated) {
        this.#emit("param.deprecated", "request", after.source, "head", {
          subject: key,
          message: `${capitalise(label)} is now deprecated`,
        });
      }
      if (before.description !== after.description) {
        this.#emit("doc.changed", "request", `${after.source}/description`, "head", {
          subject: key,
          message: `Description of ${label} changed`,
        });
      }
      this.#schemas(before.schema, after.schema, "request", label);
    }
  }

  #requestBody(b: RequestBodyIR | undefined, h: RequestBodyIR | undefined): void {
    if (!b && !h) return;
    if (!b && h) {
      this.#emit(
        h.required ? "request.body.added.required" : "request.body.added.optional",
        "request",
        h.source,
        "head",
        {
          message: `${h.required ? "Required" : "Optional"} request body was added`,
        }
      );
      return;
    }
    if (b && !h) {
      this.#emit("request.body.removed", "request", b.source, "base", { message: "Request body was removed" });
      return;
    }
    if (!b || !h) return;
    if (!b.required && h.required)
      this.#emit("request.body.made_required", "request", h.source, "head", {
        message: "Request body is now required",
      });
    if (b.required && !h.required)
      this.#emit("request.body.made_optional", "request", h.source, "head", {
        message: "Request body is no longer required",
      });
    this.#content(b.content, h.content, "request", "body");
  }

  #responses(b: Record<string, ResponseIR>, h: Record<string, ResponseIR>): void {
    const statuses = [...new Set([...Object.keys(b), ...Object.keys(h)])].sort();
    for (const status of statuses) {
      const before = b[status];
      const after = h[status];
      if (!before && after) {
        const isError = /^[45]/.test(status);
        this.#emit(
          isError ? "response.error_status.added" : "response.status.added",
          "response",
          after.source,
          "head",
          {
            subject: status,
            message: `Response status ${status} was added`,
          }
        );
      } else if (before && !after) {
        this.#emit("response.status.removed", "response", before.source, "base", {
          subject: status,
          message: `Response status ${status} was removed`,
        });
      } else if (before && after) {
        if (before.description !== after.description) {
          this.#emit("doc.changed", "response", `${after.source}/description`, "head", {
            subject: status,
            message: `Description of response ${status} changed`,
          });
        }
        this.#content(before.content, after.content, "response", `${status} body`);
      }
    }
  }

  #content(b: Record<string, MediaTypeIR>, h: Record<string, MediaTypeIR>, direction: Direction, label: string): void {
    const mediaTypes = [...new Set([...Object.keys(b), ...Object.keys(h)])].sort();
    for (const mediaType of mediaTypes) {
      const before = b[mediaType];
      const after = h[mediaType];
      const side = direction === "request" ? "Request" : "Response";
      if (!before && after) {
        this.#emit("media_type.added", direction, after.source, "head", {
          subject: mediaType,
          message: `${side} ${label}: media type ${mediaType} was added`,
        });
      } else if (before && !after) {
        this.#emit("media_type.removed", direction, before.source, "base", {
          subject: mediaType,
          message: `${side} ${label}: media type ${mediaType} was removed`,
        });
      } else if (before && after) {
        // No schema means any content is allowed, which is the empty schema.
        const bSchema = before.schema ?? { $source: `${before.source}/schema` };
        const hSchema = after.schema ?? { $source: `${after.source}/schema` };
        this.#schemas(bSchema, hSchema, direction, `${label} (${mediaType})`);
      }
    }
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
