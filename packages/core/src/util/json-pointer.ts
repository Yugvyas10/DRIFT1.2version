import { getOwn, isJsonObject, type JsonValue } from "./json.ts";

/** Escapes one JSON pointer reference token (RFC 6901 §3). */
export function escapeToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Unescapes one JSON pointer reference token (RFC 6901 §4). */
export function unescapeToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

/** Builds a JSON pointer from reference tokens. `[]` is the whole document (""). */
export function toPointer(tokens: readonly (string | number)[]): string {
  return tokens.map((token) => `/${escapeToken(String(token))}`).join("");
}

/**
 * Parses a JSON pointer into reference tokens. Returns undefined for a malformed pointer.
 * With `fromUriFragment`, each token is percent-decoded first, as a `$ref` fragment requires (RFC 6901 §6).
 */
export function parsePointer(pointer: string, fromUriFragment = false): string[] | undefined {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return undefined;
  const tokens: string[] = [];
  for (const raw of pointer.slice(1).split("/")) {
    let token = raw;
    if (fromUriFragment) {
      try {
        token = decodeURIComponent(raw);
      } catch {
        return undefined;
      }
    }
    tokens.push(unescapeToken(token));
  }
  return tokens;
}

/** Follows reference tokens into a value. Arrays accept only canonical decimal indexes. */
export function getAtTokens(
  root: JsonValue,
  tokens: readonly string[]
): { found: true; value: JsonValue } | { found: false } {
  let current: JsonValue = root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) return { found: false };
      const item = current[Number(token)];
      if (item === undefined) return { found: false };
      current = item;
    } else if (isJsonObject(current)) {
      const next = getOwn(current, token);
      if (next === undefined) return { found: false };
      current = next;
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}
