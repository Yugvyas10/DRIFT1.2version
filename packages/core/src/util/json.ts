/** A JSON value as parsed from a spec. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Own-property lookup that never reaches the prototype chain (keys come from untrusted specs). */
export function getOwn(record: JsonObject, key: string): JsonValue | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
