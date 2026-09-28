import { escapeToken } from "../util/json-pointer.ts";
import { isJsonObject, type JsonValue } from "../util/json.ts";
import type { Body, RoutedSample } from "./sample.ts";

/** What redaction removes (PLAN §4.3). On by default; the defaults can be extended, not switched off, per run. */
export interface RedactionOptions {
  /** Header names (lower case) whose values are always redacted. */
  headers: readonly string[];
  /** Query parameter, cookie and body property names (compared case-insensitively) whose values are always redacted. */
  fields: readonly string[];
}

export const DEFAULT_REDACTION: RedactionOptions = {
  headers: [
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
    "x-xsrf-token",
  ],
  fields: [
    "password",
    "passwd",
    "secret",
    "client_secret",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "api_key",
    "apikey",
    "authorization",
    "ssn",
    "card_number",
    "cvv",
    "cvc",
  ],
};

/**
 * Pattern detectors applied to every string value. Every quantifier is bounded, so a long input cannot cause
 * catastrophic backtracking.
 */
const DETECTORS: readonly [kind: string, pattern: RegExp][] = [
  ["private-key", /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/],
  ["jwt", /\beyJ[\w-]{5,8192}\.[\w-]{5,8192}\.[\w-]{0,8192}/],
  ["bearer", /\bbearer\s{1,10}[\w\-.~+/]{8,4096}/i],
  ["aws-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/],
  ["stripe-key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,255}\b/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,255}/],
  ["google-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["groq-key", /\bgsk_[A-Za-z0-9]{20,255}\b/],
  ["api-key", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,255}\b/],
  ["email", /[\w.%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/],
];

const CARD_CANDIDATE = /(?:\d[ -]?){12,18}\d/g;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** The kind of secret or personal data found in a string, if any. */
export function detect(text: string): string | undefined {
  for (const [kind, pattern] of DETECTORS) if (pattern.test(text)) return kind;
  for (const match of text.matchAll(CARD_CANDIDATE)) {
    const digits = match[0].replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return "card";
  }
  return undefined;
}

const marker = (kind: string) => `[REDACTED:${kind}]`;

class Redactor {
  readonly pointers: string[] = [];
  readonly #headers: Set<string>;
  readonly #fields: Set<string>;

  constructor(options: RedactionOptions) {
    this.#headers = new Set(options.headers.map((name) => name.toLowerCase()));
    this.#fields = new Set(options.fields.map((name) => name.toLowerCase()));
  }

  /** Redacts a named list of values (query, headers, cookies): the whole entry when any value is sensitive. */
  values(
    values: Record<string, string[]>,
    prefix: string,
    denied: (name: string) => string | undefined
  ): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [name, list] of Object.entries(values)) {
      const kind = denied(name) ?? list.map(detect).find((found) => found !== undefined);
      if (kind === undefined) {
        out[name] = list;
      } else {
        out[name] = list.map(() => marker(kind));
        this.pointers.push(`${prefix}${escapeToken(name)}`);
      }
    }
    return out;
  }

  headers(values: Record<string, string[]>, prefix: string): Record<string, string[]> {
    return this.values(values, prefix, (name) => (this.#headers.has(name) ? "header" : undefined));
  }

  query(values: Record<string, string[]>): Record<string, string[]> {
    return this.values(values, "/query/", (name) => (this.#fields.has(name.toLowerCase()) ? "field" : undefined));
  }

  json(value: JsonValue, pointer: string): JsonValue {
    if (typeof value === "string") {
      const kind = detect(value);
      if (kind === undefined) return value;
      this.pointers.push(pointer);
      return marker(kind);
    }
    if (typeof value === "number") {
      const digits = Number.isInteger(value) ? String(Math.abs(value)) : "";
      if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
        this.pointers.push(pointer);
        return marker("card");
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((item, index) => this.json(item, `${pointer}/${String(index)}`));
    if (isJsonObject(value)) {
      const out: Record<string, JsonValue> = {};
      for (const [key, item] of Object.entries(value)) {
        const itemPointer = `${pointer}/${escapeToken(key)}`;
        if (this.#fields.has(key.toLowerCase())) {
          out[key] = marker("field");
          this.pointers.push(itemPointer);
        } else {
          out[key] = this.json(item, itemPointer);
        }
      }
      return out;
    }
    return value;
  }

  body(body: Body | undefined, pointer: string): Body | undefined {
    return body ? { contentType: body.contentType, value: this.json(body.value, pointer) } : undefined;
  }
}

/**
 * Redacts a routed sample before it is kept (PLAN §4.3): denylisted headers and fields, and every string that a
 * detector recognises, in the path, query, headers, bodies and the response. Every redacted value's pointer is
 * recorded, so Verify can treat errors at those pointers as unknown instead of as failures (risk R6).
 */
export function redactSample(sample: RoutedSample, options: RedactionOptions = DEFAULT_REDACTION): RoutedSample {
  const redactor = new Redactor(options);
  const segments = sample.path.split("/");
  const pathParams = sample.pathParams.map((value, index) => {
    const kind = detect(value);
    if (kind === undefined) return value;
    redactor.pointers.push(`/path/${String(index)}`);
    return marker(kind);
  });
  const path = segments
    .map((segment) => (detect(safeDecode(segment)) === undefined ? segment : marker("path")))
    .join("/");

  const out: RoutedSample = {
    ...sample,
    path,
    pathParams,
    query: redactor.query(sample.query),
    headers: redactor.headers(sample.headers, "/headers/"),
    redacted: [],
  };
  const body = redactor.body(sample.body, "/body");
  if (body) out.body = body;
  else delete out.body;
  if (sample.response) {
    const responseBody = redactor.body(sample.response.body, "/response/body");
    out.response = {
      status: sample.response.status,
      headers: redactor.headers(sample.response.headers, "/response/headers/"),
      ...(responseBody ? { body: responseBody } : {}),
    };
  }
  out.redacted = [...new Set([...sample.redacted, ...redactor.pointers])].sort();
  return out;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
