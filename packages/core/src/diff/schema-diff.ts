import type { ChangeKind, Direction } from "@drift/report-schema";
import { canonicalJson } from "../hash/canonical-json.ts";
import type { NormalizedSchema, SpecIR } from "../ingest/ir.ts";
import { getOwn, isJsonObject, type JsonObject, type JsonValue } from "../util/json.ts";
import { schemaFingerprint } from "../util/schema.ts";

/** A change found inside a schema, before it is attached to an operation. */
export interface SchemaChange {
  kind: ChangeKind;
  location: string;
  side: "base" | "head";
  subject?: string;
  before?: JsonValue;
  after?: JsonValue;
  message: string;
}

const LOWER_BOUNDS = ["minimum", "exclusiveMinimum", "minLength", "minItems", "minProperties"] as const;
const UPPER_BOUNDS = ["maximum", "exclusiveMaximum", "maxLength", "maxItems", "maxProperties"] as const;
const MAX_ALIAS_HOPS = 32;

/**
 * Compares two normalised schemas in one direction (request or response) and reports every structural
 * difference (PLAN §4.2). Components are compared by content, not by name, so renaming a component is
 * not a change.
 *
 * Recursive schemas are compared like a graph search (Tarjan's strongly connected components). Every pair
 * of compared references gets an index; meeting a pair that is still open (on the stack, or finished inside
 * a cycle that is not closed yet) stops there, because its changes are already being collected by the
 * comparison that opened it. When the first pair of a cycle (the root of a strongly connected component)
 * finishes, its result contains everything reachable from it; every pair in that component reaches the root,
 * so they all have exactly that result, and all of them are cached with it. So each pair is compared once
 * per direction, however densely the components refer to each other, and a cached result is always complete.
 */
export class SchemaDiffer {
  readonly #base: SpecIR;
  readonly #head: SpecIR;
  readonly #cache = new Map<string, SchemaChange[]>();
  /** Open pairs (on the stack, or finished inside a component whose root is still open) → their index. */
  readonly #open = new Map<string, number>();
  /** Open pairs in the order they were opened (Tarjan's stack). */
  readonly #pending: string[] = [];
  #next = 0;

  constructor(base: SpecIR, head: SpecIR) {
    this.#base = base;
    this.#head = head;
  }

  diff(base: NormalizedSchema, head: NormalizedSchema, direction: Direction): SchemaChange[] {
    const out: SchemaChange[] = [];
    this.#walk(base, head, direction, out);
    return out;
  }

  /** Compares a pair and returns the lowest index of an open pair it reached (Infinity if none). */
  #walk(b: NormalizedSchema, h: NormalizedSchema, direction: Direction, out: SchemaChange[]): number {
    const bRef = refOf(b);
    const hRef = refOf(h);
    if (bRef === undefined && hRef === undefined) return this.#compare(b, h, direction, out);

    const key = `${direction}\0${bRef ?? `@${sourceOf(b)}`}\0${hRef ?? `@${sourceOf(h)}`}`;
    const cached = this.#cache.get(key);
    if (cached) {
      out.push(...cached);
      return Infinity;
    }
    const open = this.#open.get(key);
    if (open !== undefined) return open;

    const index = this.#next++;
    this.#open.set(key, index);
    this.#pending.push(key);
    const local: SchemaChange[] = [];
    const low = Math.min(
      index,
      this.#compare(this.#resolve(b, this.#base), this.#resolve(h, this.#head), direction, local)
    );
    out.push(...local);
    if (low < index) return low; // part of a cycle whose root is still open
    for (let member = this.#pending.pop(); member !== undefined; member = this.#pending.pop()) {
      this.#open.delete(member);
      this.#cache.set(member, local);
      if (member === key) break;
    }
    return Infinity;
  }

  /** Follows component references (including components that are themselves references). */
  #resolve(node: NormalizedSchema, spec: SpecIR): NormalizedSchema {
    let current = node;
    for (let hops = 0; hops < MAX_ALIAS_HOPS; hops++) {
      const ref = refOf(current);
      if (ref === undefined) return current;
      const target = spec.schemas[ref];
      if (!target) return { $source: ref };
      current = target;
    }
    return current;
  }

  #compare(b: NormalizedSchema, h: NormalizedSchema, direction: Direction, out: SchemaChange[]): number {
    let low = Infinity;
    const walk = (x: NormalizedSchema, y: NormalizedSchema) => {
      low = Math.min(low, this.#walk(x, y, direction, out));
    };
    const emit = (change: SchemaChange) => out.push(change);

    compareTypes(b, h, emit);
    compareFormat(b, h, emit);
    compareEnums(b, h, emit);
    compareBounds(b, h, emit);
    this.#compareAdditional(b, h, walk, emit);
    this.#compareProperties(b, h, direction, walk, emit);
    compareItems(b, h, walk, emit);
    compareVariants(b, h, walk, emit);
    compareComposition(b, h, walk, emit);
    compareAnnotations(b, h, emit);
    return low;
  }

  #compareAdditional(b: NormalizedSchema, h: NormalizedSchema, walk: Walk, emit: Emit): void {
    const ba = getOwn(b, "additionalProperties");
    const ha = getOwn(h, "additionalProperties");
    const bKind = openness(ba);
    const hKind = openness(ha);
    if (bKind === "schema" && hKind === "schema") {
      walk(ba as NormalizedSchema, ha as NormalizedSchema);
      return;
    }
    if (bKind === hKind) return;
    const rank = { open: 2, schema: 1, closed: 0 } as const;
    const tightened = rank[hKind] < rank[bKind];
    emit({
      kind: tightened ? "schema.additional_properties.tightened" : "schema.additional_properties.relaxed",
      ...at(h, "head", ha === undefined ? undefined : "additionalProperties"),
      before: describeOpenness(ba),
      after: describeOpenness(ha),
      message: `Additional properties ${tightened ? "restricted" : "allowed"}: ${describeOpenness(ba)} → ${describeOpenness(ha)}`,
    });
  }

  #compareProperties(b: NormalizedSchema, h: NormalizedSchema, direction: Direction, walk: Walk, emit: Emit): void {
    const bProps = objectOf(b, "properties");
    const hProps = objectOf(h, "properties");
    const bRequired = new Set(stringsOf(b, "required"));
    const hRequired = new Set(stringsOf(h, "required"));
    const names = [...new Set([...Object.keys(bProps), ...Object.keys(hProps), ...bRequired, ...hRequired])].sort();
    for (const name of names) {
      const bProp = propertyOf(bProps, name);
      const hProp = propertyOf(hProps, name);
      const bPresent = (bProp !== undefined || bRequired.has(name)) && !this.#excluded(bProp, direction, this.#base);
      const hPresent = (hProp !== undefined || hRequired.has(name)) && !this.#excluded(hProp, direction, this.#head);
      if (!bPresent && !hPresent) continue;
      if (!bPresent) {
        const required = hRequired.has(name);
        emit({
          kind: required ? "schema.property.added.required" : "schema.property.added.optional",
          ...propertyLocation(h, hProp, "head"),
          subject: name,
          message: `Property "${name}" was added as ${required ? "required" : "optional"}`,
        });
        continue;
      }
      if (!hPresent) {
        emit({
          kind: "schema.property.removed",
          ...propertyLocation(b, bProp, "base"),
          subject: name,
          message: `Property "${name}" was removed`,
        });
        continue;
      }
      if (!bRequired.has(name) && hRequired.has(name)) {
        emit({
          kind: "schema.property.made_required",
          ...at(h, "head", "required"),
          subject: name,
          message: `Property "${name}" is now required`,
        });
      } else if (bRequired.has(name) && !hRequired.has(name)) {
        emit({
          kind: "schema.property.made_optional",
          ...at(h, "head"),
          subject: name,
          message: `Property "${name}" is no longer required`,
        });
      }
      walk(
        bProp ?? { $source: `${sourceOf(b)}/properties/${name}` },
        hProp ?? { $source: `${sourceOf(h)}/properties/${name}` }
      );
    }
  }

  /** readOnly properties are not part of a request, writeOnly properties not part of a response. */
  #excluded(property: NormalizedSchema | undefined, direction: Direction, spec: SpecIR): boolean {
    if (!property) return false;
    const resolved = this.#resolve(property, spec);
    return getOwn(resolved, direction === "request" ? "readOnly" : "writeOnly") === true;
  }
}

type Emit = (change: SchemaChange) => void;
type Walk = (base: NormalizedSchema, head: NormalizedSchema) => void;

function refOf(node: NormalizedSchema): string | undefined {
  const ref = getOwn(node, "$ref");
  return typeof ref === "string" ? ref : undefined;
}

function sourceOf(node: NormalizedSchema): string {
  const source = getOwn(node, "$source");
  return typeof source === "string" ? source : "#";
}

/** Location of a node, or of one of its keywords, on one side. */
function at(
  node: NormalizedSchema,
  side: "base" | "head",
  keyword?: string
): { location: string; side: "base" | "head" } {
  return { location: keyword === undefined ? sourceOf(node) : `${sourceOf(node)}/${keyword}`, side };
}

function propertyLocation(parent: NormalizedSchema, property: NormalizedSchema | undefined, side: "base" | "head") {
  return property ? at(property, side) : at(parent, side, "required");
}

function objectOf(node: NormalizedSchema, keyword: string): JsonObject {
  const value = getOwn(node, keyword);
  return isJsonObject(value) ? value : {};
}

function propertyOf(properties: JsonObject, name: string): NormalizedSchema | undefined {
  const value = getOwn(properties, name);
  return isJsonObject(value) ? value : undefined;
}

function stringsOf(node: NormalizedSchema, keyword: string): string[] {
  const value = getOwn(node, keyword);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function schemaOf(node: NormalizedSchema, keyword: string): NormalizedSchema | undefined {
  const value = getOwn(node, keyword);
  return isJsonObject(value) ? value : undefined;
}

function listOf(node: NormalizedSchema, keyword: string): NormalizedSchema[] | undefined {
  const value = getOwn(node, keyword);
  return Array.isArray(value) ? value.filter(isJsonObject) : undefined;
}

function compareTypes(b: NormalizedSchema, h: NormalizedSchema, emit: Emit): void {
  const bTypes = getOwn(b, "type") === undefined ? undefined : stringsOf(b, "type");
  const hTypes = getOwn(h, "type") === undefined ? undefined : stringsOf(h, "type");
  if (canonicalJson(bTypes ?? null) === canonicalJson(hTypes ?? null)) return;
  const shown = (types: string[] | undefined) => (types ? types.join(" | ") : "any");
  let kind: ChangeKind;
  if (bTypes === undefined) kind = "schema.type.narrowed";
  else if (hTypes === undefined) kind = "schema.type.widened";
  else {
    const covers = (set: string[], type: string) =>
      set.includes(type) || (type === "integer" && set.includes("number"));
    const removed = bTypes.filter((type) => !covers(hTypes, type));
    const added = hTypes.filter((type) => !covers(bTypes, type));
    if (removed.length > 0 && added.length > 0) kind = "schema.type.changed";
    else if (removed.length > 0) kind = "schema.type.narrowed";
    else if (added.length > 0) kind = "schema.type.widened";
    else return; // e.g. ["integer", "number"] vs ["number"]: the same set of values
  }
  emit({
    kind,
    ...at(h, "head", hTypes === undefined ? undefined : "type"),
    ...(bTypes === undefined ? {} : { before: bTypes }),
    ...(hTypes === undefined ? {} : { after: hTypes }),
    message: `Type changed from ${shown(bTypes)} to ${shown(hTypes)}`,
  });
}

function compareFormat(b: NormalizedSchema, h: NormalizedSchema, emit: Emit): void {
  const bFormat = getOwn(b, "format");
  const hFormat = getOwn(h, "format");
  if (bFormat === hFormat) return;
  emit({
    kind: "schema.format.changed",
    ...(hFormat === undefined ? at(b, "base", "format") : at(h, "head", "format")),
    ...(bFormat === undefined ? {} : { before: bFormat }),
    ...(hFormat === undefined ? {} : { after: hFormat }),
    message: `Format changed from ${bFormat === undefined ? "none" : JSON.stringify(bFormat)} to ${hFormat === undefined ? "none" : JSON.stringify(hFormat)}`,
  });
}

/** Allowed values from `enum`, or `[const]`; undefined when the schema has neither. */
function allowedValues(node: NormalizedSchema): { values: JsonValue[]; keyword: "enum" | "const" } | undefined {
  const values = getOwn(node, "enum");
  if (Array.isArray(values)) return { values, keyword: "enum" };
  const constant = getOwn(node, "const");
  return constant === undefined ? undefined : { values: [constant], keyword: "const" };
}

function compareEnums(b: NormalizedSchema, h: NormalizedSchema, emit: Emit): void {
  const bAllowed = allowedValues(b);
  const hAllowed = allowedValues(h);
  if (!bAllowed && !hAllowed) return;
  if (bAllowed && hAllowed) {
    const bKeys = new Map(bAllowed.values.map((value) => [canonicalJson(value), value]));
    const hKeys = new Map(hAllowed.values.map((value) => [canonicalJson(value), value]));
    for (const [key, value] of bKeys) {
      if (!hKeys.has(key)) {
        emit({
          kind: "schema.enum.value_removed",
          ...at(b, "base", bAllowed.keyword),
          subject: key,
          before: value,
          message: `Enum value ${key} was removed`,
        });
      }
    }
    for (const [key, value] of hKeys) {
      if (!bKeys.has(key)) {
        emit({
          kind: "schema.enum.value_added",
          ...at(h, "head", hAllowed.keyword),
          subject: key,
          after: value,
          message: `Enum value ${key} was added`,
        });
      }
    }
    return;
  }
  if (hAllowed) {
    emit({
      kind: "schema.bound.tightened",
      ...at(h, "head", hAllowed.keyword),
      subject: hAllowed.keyword,
      after: hAllowed.values,
      message: `Values restricted to ${canonicalJson(hAllowed.values)}`,
    });
  } else if (bAllowed) {
    emit({
      kind: "schema.bound.relaxed",
      ...at(h, "head"),
      subject: bAllowed.keyword,
      before: bAllowed.values,
      message: `Values no longer restricted to ${canonicalJson(bAllowed.values)}`,
    });
  }
}

function numberOf(node: NormalizedSchema, keyword: string): number | undefined {
  const value = getOwn(node, keyword);
  return typeof value === "number" ? value : undefined;
}

function compareBounds(b: NormalizedSchema, h: NormalizedSchema, emit: Emit): void {
  const bound = (keyword: string, tightened: boolean, before: JsonValue | undefined, after: JsonValue | undefined) => {
    const show = (value: JsonValue | undefined) => (value === undefined ? "none" : JSON.stringify(value));
    emit({
      kind: tightened ? "schema.bound.tightened" : "schema.bound.relaxed",
      ...(after === undefined ? at(b, "base", keyword) : at(h, "head", keyword)),
      subject: keyword,
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
      message: `"${keyword}" ${tightened ? "tightened" : "relaxed"}: ${show(before)} → ${show(after)}`,
    });
  };
  for (const keyword of LOWER_BOUNDS) {
    const bv = numberOf(b, keyword);
    const hv = numberOf(h, keyword);
    if (bv === hv) continue;
    bound(keyword, hv !== undefined && (bv === undefined || hv > bv), bv, hv);
  }
  for (const keyword of UPPER_BOUNDS) {
    const bv = numberOf(b, keyword);
    const hv = numberOf(h, keyword);
    if (bv === hv) continue;
    bound(keyword, hv !== undefined && (bv === undefined || hv < bv), bv, hv);
  }
  const bPattern = getOwn(b, "pattern");
  const hPattern = getOwn(h, "pattern");
  if (bPattern !== hPattern) bound("pattern", hPattern !== undefined, bPattern, hPattern);

  const bMultiple = numberOf(b, "multipleOf");
  const hMultiple = numberOf(h, "multipleOf");
  if (bMultiple !== hMultiple) {
    // A new divisor that divides the old one accepts every value the old one did: relaxed.
    const relaxed = hMultiple === undefined || (bMultiple !== undefined && Number.isInteger(bMultiple / hMultiple));
    bound("multipleOf", !relaxed, bMultiple, hMultiple);
  }
  const bUnique = getOwn(b, "uniqueItems") === true;
  const hUnique = getOwn(h, "uniqueItems") === true;
  if (bUnique !== hUnique) bound("uniqueItems", hUnique, bUnique, hUnique);
}

function openness(value: JsonValue | undefined): "open" | "schema" | "closed" {
  if (value === undefined || value === true) return "open";
  if (value === false) return "closed";
  return "schema";
}

function describeOpenness(value: JsonValue | undefined): string {
  const kind = openness(value);
  return kind === "open" ? "any" : kind === "closed" ? "none" : "schema";
}

function compareItems(b: NormalizedSchema, h: NormalizedSchema, walk: Walk, emit: Emit): void {
  const bItems = schemaOf(b, "items");
  const hItems = schemaOf(h, "items");
  if (bItems && hItems) walk(bItems, hItems);
  else if (hItems)
    emit({
      kind: "schema.bound.tightened",
      ...at(hItems, "head"),
      subject: "items",
      message: "Array items are now constrained",
    });
  else if (bItems)
    emit({
      kind: "schema.bound.relaxed",
      ...at(h, "head"),
      subject: "items",
      message: "Array items are no longer constrained",
    });

  const bPrefix = listOf(b, "prefixItems");
  const hPrefix = listOf(h, "prefixItems");
  if (!bPrefix && !hPrefix) return;
  if (bPrefix?.length !== hPrefix?.length) {
    emit({
      kind: "schema.composition.changed",
      ...at(h, "head"),
      subject: "prefixItems",
      message: "Tuple items (prefixItems) changed length",
    });
  }
  const shared = Math.min(bPrefix?.length ?? 0, hPrefix?.length ?? 0);
  for (let index = 0; index < shared; index++) walk((bPrefix ?? [])[index] ?? {}, (hPrefix ?? [])[index] ?? {});
}

/** oneOf/anyOf branches are matched by component reference, then by content; unmatched ones were added or removed. */
function compareVariants(b: NormalizedSchema, h: NormalizedSchema, walk: Walk, emit: Emit): void {
  for (const keyword of ["oneOf", "anyOf"] as const) {
    const bList = listOf(b, keyword);
    const hList = listOf(h, keyword);
    if (!bList && !hList) continue;
    if (!bList || !hList) {
      emit({
        kind: "schema.composition.changed",
        ...at(h, "head"),
        subject: keyword,
        message: `"${keyword}" was ${bList ? "removed" : "added"}`,
      });
      continue;
    }
    const keyOf = (branch: NormalizedSchema) => refOf(branch) ?? `#${schemaFingerprint(branch)}`;
    const hByKey = new Map(hList.map((branch) => [keyOf(branch), branch]));
    const bByKey = new Map(bList.map((branch) => [keyOf(branch), branch]));
    const removed = bList.filter((branch) => !hByKey.has(keyOf(branch)));
    const added = hList.filter((branch) => !bByKey.has(keyOf(branch)));
    for (const [key, branch] of bByKey) {
      const match = hByKey.get(key);
      if (match) walk(branch, match);
    }
    const [onlyRemoved] = removed;
    const [onlyAdded] = added;
    if (removed.length === 1 && added.length === 1 && onlyRemoved && onlyAdded) {
      walk(onlyRemoved, onlyAdded); // one branch edited in place
      continue;
    }
    for (const branch of removed) {
      emit({
        kind: "schema.variant.removed",
        ...at(branch, "base"),
        subject: keyword,
        message: `A "${keyword}" alternative was removed`,
      });
    }
    for (const branch of added) {
      emit({
        kind: "schema.variant.added",
        ...at(branch, "head"),
        subject: keyword,
        message: `A "${keyword}" alternative was added`,
      });
    }
  }
}

function compareComposition(b: NormalizedSchema, h: NormalizedSchema, walk: Walk, emit: Emit): void {
  const bAll = listOf(b, "allOf");
  const hAll = listOf(h, "allOf");
  if (bAll?.length === hAll?.length && bAll && hAll) {
    bAll.forEach((branch, index) => {
      walk(branch, hAll[index] ?? {});
    });
  } else if (bAll || hAll) {
    emit({
      kind: "schema.composition.changed",
      ...at(h, "head"),
      subject: "allOf",
      message: `"allOf" composition changed`,
    });
  }
  const bNot = getOwn(b, "not");
  const hNot = getOwn(h, "not");
  if (
    (bNot === undefined) !== (hNot === undefined) ||
    (bNot !== undefined && hNot !== undefined && schemaFingerprint(bNot) !== schemaFingerprint(hNot))
  ) {
    emit({ kind: "schema.composition.changed", ...at(h, "head"), subject: "not", message: `"not" changed` });
  }
  const bDisc = getOwn(b, "discriminator");
  const hDisc = getOwn(h, "discriminator");
  if (canonicalJson(bDisc ?? null) !== canonicalJson(hDisc ?? null)) {
    emit({
      kind: "schema.discriminator.changed",
      ...(hDisc === undefined ? at(b, "base", "discriminator") : at(h, "head", "discriminator")),
      ...(bDisc === undefined ? {} : { before: bDisc }),
      ...(hDisc === undefined ? {} : { after: hDisc }),
      message: "Discriminator changed",
    });
  }
}

function compareAnnotations(b: NormalizedSchema, h: NormalizedSchema, emit: Emit): void {
  const bDefault = getOwn(b, "default");
  const hDefault = getOwn(h, "default");
  if (
    canonicalJson(bDefault ?? null) !== canonicalJson(hDefault ?? null) ||
    (bDefault === undefined) !== (hDefault === undefined)
  ) {
    emit({
      kind: "schema.default.changed",
      ...(hDefault === undefined ? at(b, "base", "default") : at(h, "head", "default")),
      ...(bDefault === undefined ? {} : { before: bDefault }),
      ...(hDefault === undefined ? {} : { after: hDefault }),
      message: `Default changed from ${bDefault === undefined ? "none" : canonicalJson(bDefault)} to ${hDefault === undefined ? "none" : canonicalJson(hDefault)}`,
    });
  }
  if (getOwn(b, "deprecated") !== true && getOwn(h, "deprecated") === true) {
    emit({ kind: "schema.deprecated", ...at(h, "head", "deprecated"), message: "Schema was marked deprecated" });
  }
  for (const keyword of ["title", "description"] as const) {
    const before = getOwn(b, keyword);
    const after = getOwn(h, keyword);
    if (before === after) continue;
    emit({
      kind: "doc.changed",
      ...(after === undefined ? at(b, "base", keyword) : at(h, "head", keyword)),
      subject: keyword,
      message: `Schema ${keyword} changed`,
    });
  }
}
