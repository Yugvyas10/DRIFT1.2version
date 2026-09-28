import { canonicalJson } from "../hash/canonical-json.ts";
import { isJsonObject, type JsonValue } from "./json.ts";

/** A deep copy without `$source` annotations, for comparing schemas by content alone. */
export function withoutSources(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(withoutSources);
  if (!isJsonObject(value)) return value;
  const copy: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key !== "$source") copy[key] = withoutSources(item);
  }
  return copy;
}

/** Canonical JSON of a schema's content, ignoring where it came from. */
export function schemaFingerprint(value: JsonValue): string {
  return canonicalJson(withoutSources(value));
}
