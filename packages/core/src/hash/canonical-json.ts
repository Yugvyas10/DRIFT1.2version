/**
 * Canonical JSON serialisation per RFC 8785 (JSON Canonicalization Scheme, "JCS").
 *
 * Two values that are equal as JSON data always serialise to the same string, whatever the
 * key order they were built with. That makes the output safe to hash for content addressing
 * (ADR-0006).
 *
 * Rules:
 * - Object keys are sorted by UTF-16 code units (RFC 8785 §3.2.3). This is exactly what the
 *   default `Array.prototype.sort` does for strings.
 * - Numbers use the ECMAScript number-to-string algorithm (RFC 8785 §3.2.2.3), which is what
 *   `JSON.stringify` produces for finite numbers. `-0` serialises as `0`.
 * - Strings are escaped as `JSON.stringify` escapes them, which matches RFC 8785 §3.2.2.2 for
 *   well-formed Unicode. Lone surrogates are rejected.
 * - Object properties whose value is `undefined` are omitted, as `JSON.stringify` omits them,
 *   so optional TypeScript fields do not change a hash.
 * - Anything that is not JSON data is rejected rather than silently converted: non-finite
 *   numbers, bigint, functions, symbols, `undefined` array items, class instances such as
 *   Date or Map, and circular references.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value, "$", new Set<object>());
}

/** Thrown when a value cannot be represented as canonical JSON. `path` locates the problem. */
export class CanonicalJsonError extends TypeError {
  readonly path: string;

  constructor(reason: string, path: string) {
    super(`Cannot canonicalise ${path}: ${reason}`);
    this.name = "CanonicalJsonError";
    this.path = path;
  }
}

function serialize(value: unknown, path: string, ancestors: Set<object>): string {
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalJsonError(`non-finite number ${String(value)}`, path);
      }
      return JSON.stringify(value);
    case "string":
      if (!value.isWellFormed()) {
        throw new CanonicalJsonError("string contains a lone surrogate", path);
      }
      return JSON.stringify(value);
    case "object":
      if (value === null) {
        return "null";
      }
      return serializeContainer(value, path, ancestors);
    default:
      throw new CanonicalJsonError(`unsupported type ${typeof value}`, path);
  }
}

function serializeContainer(value: object, path: string, ancestors: Set<object>): string {
  if (ancestors.has(value)) {
    throw new CanonicalJsonError("circular reference", path);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return serializeArray(value, path, ancestors);
    }
    if (!isPlainObject(value)) {
      throw new CanonicalJsonError(`unsupported object type ${value.constructor.name}`, path);
    }
    return serializeObject(value, path, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function serializeArray(items: readonly unknown[], path: string, ancestors: Set<object>): string {
  const parts: string[] = [];
  for (let index = 0; index < items.length; index++) {
    const item: unknown = items[index];
    const itemPath = `${path}[${index}]`;
    if (item === undefined) {
      throw new CanonicalJsonError("undefined array item", itemPath);
    }
    parts.push(serialize(item, itemPath, ancestors));
  }
  return `[${parts.join(",")}]`;
}

function serializeObject(record: Record<string, unknown>, path: string, ancestors: Set<object>): string {
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const member = record[key];
    if (member === undefined) {
      continue;
    }
    parts.push(`${JSON.stringify(key)}:${serialize(member, `${path}.${key}`, ancestors)}`);
  }
  return `{${parts.join(",")}}`;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
