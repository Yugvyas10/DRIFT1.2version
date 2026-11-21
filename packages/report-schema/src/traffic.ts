import { z } from "zod";

/** Format identifier of recorded traffic files: one JSON object per line (JSONL). */
export const TRAFFIC_FORMAT = "drift-traffic/v1";

/** A header or query value; repeated keys become an array. */
export const WireValue = z.union([z.string(), z.array(z.string())]);
export type WireValue = z.infer<typeof WireValue>;

/**
 * One recorded HTTP exchange (PLAN §4.3). Every line of a traffic file is one record.
 *
 * - `path` is the request path as sent, optionally with a query string (`/pets?limit=10`); values in `query`
 *   are added to those from the query string.
 * - Header names are case-insensitive.
 * - Bodies are JSON values: for a JSON media type the parsed document, otherwise the body text as a string.
 * - Unknown fields are rejected, so a misspelt field is reported instead of silently ignored.
 */
export const TrafficRecord = z
  .strictObject({
    method: z.string().regex(/^[A-Za-z]+$/, "an HTTP method such as GET"),
    path: z.string().startsWith("/", "a path starting with /"),
    query: z.record(z.string(), WireValue).optional(),
    headers: z.record(z.string(), WireValue).optional(),
    requestBody: z.json().optional(),
    status: z.number().int().min(100).max(599).optional(),
    responseHeaders: z.record(z.string(), WireValue).optional(),
    responseBody: z.json().optional(),
    timestamp: z.iso.datetime({ offset: true }).optional(),
    clientId: z.string().min(1).max(200).optional(),
  })
  .meta({
    id: "drift-traffic-v1",
    title: "DRIFT traffic record (drift-traffic/v1)",
    description: "One recorded HTTP exchange; a traffic file has one record per line (JSONL).",
  });
export type TrafficRecord = z.infer<typeof TrafficRecord>;
