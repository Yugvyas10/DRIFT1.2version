import type { z } from "zod";

/** An error with an HTTP status, answered as an RFC 9457 problem document. */
export class HttpError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  /** Extra response headers, e.g. `Retry-After`. */
  readonly headers: Readonly<Record<string, string>>;

  constructor(status: number, title: string, detail?: string, headers: Record<string, string> = {}) {
    super(detail ?? title);
    this.name = "HttpError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.headers = headers;
  }
}

export const unauthorized = () => new HttpError(401, "Unauthorized", "A valid API key or session is required.");
export const forbidden = (detail = "You may not do this.") => new HttpError(403, "Forbidden", detail);
/** Also used for resources of other organisations, so their existence is not revealed. */
export const notFound = () => new HttpError(404, "Not found");
export const badRequest = (detail: string) => new HttpError(400, "Bad request", detail);
export const conflict = (detail: string) => new HttpError(409, "Conflict", detail);
export const tooLarge = (limit: number) =>
  new HttpError(413, "Payload too large", `The body may be at most ${String(limit)} bytes.`);
export const unprocessable = (detail: string) => new HttpError(422, "Unprocessable content", detail);
export const tooManyRequests = (retryAfterSeconds: number) =>
  new HttpError(429, "Too many requests", `Try again in ${String(retryAfterSeconds)} seconds.`, {
    "retry-after": String(retryAfterSeconds),
  });

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function problem(error: HttpError): Response {
  const body = {
    type: "about:blank",
    title: error.title,
    status: error.status,
    ...(error.detail === undefined ? {} : { detail: error.detail }),
  };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: {
      "content-type": "application/problem+json; charset=utf-8",
      "cache-control": "no-store",
      ...error.headers,
    },
  });
}

/**
 * Wraps a route handler: an HttpError becomes its problem document, and anything else a 500 that says nothing
 * about the cause (the error goes to `report`, which logs it without request data).
 */
export function route<A extends unknown[]>(
  handler: (request: Request, ...args: A) => Promise<Response>,
  report: (error: unknown) => void = (error) => {
    console.error("unhandled error in an API route:", error instanceof Error ? error.name : "unknown");
  }
): (request: Request, ...args: A) => Promise<Response> {
  return async (request, ...args) => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof HttpError) return problem(error);
      report(error);
      return problem(new HttpError(500, "Internal error"));
    }
  };
}

/**
 * Reads a JSON body of at most `maxBytes`. The declared length is checked first, and the stream is counted while
 * it is read, so a body without (or with a false) Content-Length cannot exceed the limit either.
 */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, "Unsupported media type", "Send application/json.");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(maxBytes);
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge(maxBytes);
      }
      chunks.push(value);
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw badRequest("The body is not valid JSON.");
  }
}

/** Validates input with a zod schema; a failure is a 400 (or `status`) that names the fields, never the values. */
export function parse<T>(schema: z.ZodType<T>, value: unknown, status: 400 | 422 = 400): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const detail = result.error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join(".") || "(body)"}: ${issue.message}`)
    .join("; ");
  throw status === 422 ? unprocessable(detail) : badRequest(detail);
}
