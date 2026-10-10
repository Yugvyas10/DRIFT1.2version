import type { Db } from "@drift/db";
import {
  compareEventIds,
  isEventId,
  isTerminal,
  readRunEvents,
  type Redis,
  type RunEvent,
  type RunEventHub,
  type StoredRunEvent,
} from "@drift/platform";

/** Comment lines keep proxies from closing an idle connection (ADR-0004). */
export const HEARTBEAT_MS = 15_000;

const encoder = new TextEncoder();

function frame(event: RunEvent, id?: string): Uint8Array {
  return encoder.encode(
    `${id === undefined ? "" : `id: ${id}\n`}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  );
}

/** The final event of a run whose event history is gone (it expires a day after the run ends), from the database. */
async function finalEvent(db: Db, runId: string): Promise<RunEvent | undefined> {
  const run = await db.run.findUnique({ where: { id: runId } });
  if (!run) return undefined;
  const at = (run.completedAt ?? run.createdAt).toISOString();
  if (run.status === "FAILED") {
    return {
      type: "run.failed",
      at,
      category: run.errorCategory ?? "internal",
      message: run.errorMessage ?? "",
      willRetry: false,
    };
  }
  if (run.status !== "COMPLETE" || run.gatePassed === null) return undefined;
  return {
    type: "run.completed",
    at,
    gate: { passed: run.gatePassed, failOn: run.failOn ?? "breaking" },
    summary: {
      breaking: run.breaking ?? 0,
      risky: run.risky ?? 0,
      safe: run.safe ?? 0,
      suppressed: run.suppressed ?? 0,
    },
    semver: run.semver ?? "patch",
  };
}

/**
 * `GET /api/v1/runs/{id}/events` (ADR-0004): the run's events as Server-Sent Events.
 *
 * 1. Subscribe to live events first, holding them back.
 * 2. Replay history from the run's Redis Stream: everything, or only what came after `Last-Event-ID`.
 * 3. Release the held events, skipping any the replay already sent, then stream live.
 *
 * Subscribing before replaying is what closes the gap: an event published between the two is held, not lost,
 * and the id comparison keeps it from being sent twice. The stream ends after the run's final event.
 */
export function runEventStream(
  deps: { db: Db; redis: Redis; hub: Pick<RunEventHub, "subscribe"> },
  runId: string,
  request: Request,
  heartbeatMs = HEARTBEAT_MS
): Response {
  const header = request.headers.get("last-event-id");
  const lastEventId = header !== null && isEventId(header) ? header : undefined;
  let cleanup: () => Promise<void> = () => Promise.resolve();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSent = lastEventId;
      let live = false;
      let closed = false;
      // Read through a function: `closed` changes in callbacks, which control-flow narrowing does not see.
      const isClosed = () => closed;
      const held: StoredRunEvent[] = [];
      let unsubscribe: () => Promise<void> = () => Promise.resolve();
      const heartbeat = setInterval(() => {
        if (!isClosed()) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, heartbeatMs);
      const close = async () => {
        if (isClosed()) return;
        closed = true;
        clearInterval(heartbeat);
        await unsubscribe();
        try {
          controller.close();
        } catch {
          // the client already went away
        }
      };
      cleanup = close;
      request.signal.addEventListener("abort", () => void close());

      const send = (stored: StoredRunEvent) => {
        if (isClosed() || (lastSent !== undefined && compareEventIds(stored.id, lastSent) <= 0)) return;
        lastSent = stored.id;
        controller.enqueue(frame(stored.event, stored.id));
        if (isTerminal(stored.event)) void close();
      };

      unsubscribe = await deps.hub.subscribe(runId, (stored) => {
        if (live) send(stored);
        else held.push(stored);
      });
      const history = await readRunEvents(deps.redis, runId, lastEventId);
      for (const stored of history) send(stored);
      live = true;
      for (const stored of held) send(stored);

      // The run may already be over: a client that reconnects after the end, or history that has expired (a day
      // after the run ends). Send whatever the stream still has after the last event sent. If the history has no
      // final event at all, say how the run ended from the database. Then close. (A client that reconnects after
      // it has seen the final event gets nothing more: the history shows it already had it.)
      if (!isClosed()) {
        const final = await finalEvent(deps.db, runId);
        if (final) {
          const all = await readRunEvents(deps.redis, runId);
          for (const stored of all) send(stored);
          if (!isClosed() && !all.some((stored) => isTerminal(stored.event))) controller.enqueue(frame(final));
          await close();
        }
      }
    },
    cancel: () => cleanup(),
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      // Tells nginx-style proxies not to buffer the stream.
      "x-accel-buffering": "no",
    },
  });
}
