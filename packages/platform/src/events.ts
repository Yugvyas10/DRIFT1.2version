import type { Redis } from "ioredis";
import { z } from "zod";

const Stage = z.enum(["ingest.base", "ingest.head", "diff", "corpus", "verify", "classify"]);

/**
 * What happens to a server-side run, as the worker reports it and `GET /api/v1/runs/{id}/events` streams it
 * (ADR-0004). Events never carry payloads or contract content: only names, counts and timings.
 */
export const RunEvent = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("run.queued"), at: z.string() }),
  z.strictObject({ type: z.literal("run.started"), at: z.string(), attempt: z.number().int().min(1) }),
  z.strictObject({ type: z.literal("stage.started"), at: z.string(), attempt: z.number().int().min(1), stage: Stage }),
  z.strictObject({
    type: z.literal("stage.finished"),
    at: z.string(),
    attempt: z.number().int().min(1),
    stage: Stage,
    cacheHit: z.boolean(),
    durationMs: z.number().int().min(0),
  }),
  z.strictObject({
    type: z.literal("run.completed"),
    at: z.string(),
    gate: z.strictObject({ passed: z.boolean(), failOn: z.string() }),
    summary: z.strictObject({ breaking: z.number(), risky: z.number(), safe: z.number(), suppressed: z.number() }),
    semver: z.string(),
  }),
  z.strictObject({
    type: z.literal("run.failed"),
    at: z.string(),
    category: z.string(),
    message: z.string(),
    /** True when the queue will try the run again: the stream stays open. */
    willRetry: z.boolean(),
  }),
]);
export type RunEvent = z.infer<typeof RunEvent>;

export interface StoredRunEvent {
  /** The Redis Stream entry id, used as the SSE `id:` and as `Last-Event-ID`. */
  id: string;
  event: RunEvent;
}

/** After one of these, nothing more happens to the run. */
export function isTerminal(event: RunEvent): boolean {
  return event.type === "run.completed" || (event.type === "run.failed" && !event.willRetry);
}

const STREAM_MAX_LENGTH = 500;
/** A finished run's events stay replayable for a day; an unfinished run's for a week (then the key is dropped). */
const FINISHED_TTL_SECONDS = 24 * 3600;
const ACTIVE_TTL_SECONDS = 7 * 24 * 3600;

const streamKey = (runId: string) => `drift:run:${runId}:events`;
const channel = (runId: string) => `drift:run:${runId}`;

/** Whether a string is a Redis Stream entry id (`<ms>-<seq>`); anything else in `Last-Event-ID` is ignored. */
export function isEventId(value: string): boolean {
  return /^[0-9]{1,15}-[0-9]{1,10}$/.test(value);
}

/**
 * Records an event: appended to the run's Redis Stream (history, for catch-up and resume) and published on its
 * channel (live fan-out). Pub/sub alone has no history, so the Stream is what makes `Last-Event-ID` work.
 */
export async function publishRunEvent(redis: Redis, runId: string, event: RunEvent): Promise<StoredRunEvent> {
  const data = JSON.stringify(RunEvent.parse(event));
  const key = streamKey(runId);
  const id = await redis.xadd(key, "MAXLEN", "~", STREAM_MAX_LENGTH, "*", "event", data);
  if (id === null) throw new Error("the event could not be appended to the run's stream");
  await redis.expire(key, isTerminal(event) ? FINISHED_TTL_SECONDS : ACTIVE_TTL_SECONDS);
  await redis.publish(channel(runId), JSON.stringify({ id, event: JSON.parse(data) as unknown }));
  return { id, event };
}

/** The run's events after `afterId` (exclusive), oldest first; all of them without it. */
export async function readRunEvents(redis: Redis, runId: string, afterId?: string): Promise<StoredRunEvent[]> {
  const start = afterId !== undefined && isEventId(afterId) ? `(${afterId}` : "-";
  const entries = await redis.xrange(streamKey(runId), start, "+");
  const events: StoredRunEvent[] = [];
  for (const [id, fields] of entries) {
    const index = fields.indexOf("event");
    const parsed = RunEvent.safeParse(safeJson(fields[index + 1]));
    if (index !== -1 && parsed.success) events.push({ id, event: parsed.data });
  }
  return events;
}

function safeJson(text: string | undefined): unknown {
  try {
    return JSON.parse(text ?? "");
  } catch {
    return undefined;
  }
}

/** Compares two stream ids: negative when `a` is older than `b`. */
export function compareEventIds(a: string, b: string): number {
  const [aMs = "0", aSeq = "0"] = a.split("-");
  const [bMs = "0", bSeq = "0"] = b.split("-");
  return Number(aMs) - Number(bMs) || Number(aSeq) - Number(bSeq);
}

/**
 * Live run events for one process. It holds a single subscriber connection, however many runs are being
 * watched, and fans each message out to that run's listeners (ADR-0004: "each web instance holds one subscriber
 * connection").
 */
export class RunEventHub {
  readonly #subscriber: Redis;
  readonly #listeners = new Map<string, Set<(stored: StoredRunEvent) => void>>();

  constructor(redis: Redis) {
    this.#subscriber = redis.duplicate();
    this.#subscriber.on("message", (name: string, message: string) => {
      const runId = name.slice("drift:run:".length);
      const parsed = z.object({ id: z.string(), event: RunEvent }).safeParse(safeJson(message));
      if (!parsed.success) return;
      for (const listener of this.#listeners.get(runId) ?? []) listener(parsed.data);
    });
  }

  /** Calls `listener` for every event of the run from now on. Returns the function that stops it. */
  async subscribe(runId: string, listener: (stored: StoredRunEvent) => void): Promise<() => Promise<void>> {
    let listeners = this.#listeners.get(runId);
    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(runId, listeners);
      await this.#subscriber.subscribe(channel(runId));
    }
    listeners.add(listener);
    return async () => {
      const current = this.#listeners.get(runId);
      current?.delete(listener);
      if (current?.size === 0) {
        this.#listeners.delete(runId);
        await this.#subscriber.unsubscribe(channel(runId));
      }
    };
  }

  /** How many runs are being watched (for tests). */
  get watched(): number {
    return this.#listeners.size;
  }

  async close(): Promise<void> {
    this.#listeners.clear();
    await this.#subscriber.quit();
  }
}
