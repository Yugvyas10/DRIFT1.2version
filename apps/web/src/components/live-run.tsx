"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** The six stages of a run, in order (ADR-0004). */
const STAGES = ["ingest.base", "ingest.head", "diff", "corpus", "verify", "classify"] as const;

export interface StageState {
  stage: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  cacheHit: boolean;
  durationMs?: number;
}

type RunEvent =
  | { type: "run.queued" }
  | { type: "run.started"; attempt: number }
  | { type: "stage.started"; stage: string }
  | { type: "stage.finished"; stage: string; cacheHit: boolean; durationMs: number }
  | { type: "run.completed" }
  | { type: "run.failed"; message: string; willRetry: boolean };

const EVENTS = ["run.queued", "run.started", "stage.started", "stage.finished", "run.completed", "run.failed"];

/**
 * A run's stages, live (PLAN M6, minimal): follows `GET /api/v1/runs/{id}/events` with an EventSource, which
 * sends the session cookie and resumes with `Last-Event-ID` by itself after a dropped connection. When the run
 * ends it stops listening and reloads the page's server data (status, gate, summary).
 */
export function LiveRun({
  runId,
  live,
  initial,
}: {
  runId: string;
  /** False for a run that is already over: nothing to follow. */
  live: boolean;
  initial: StageState[];
}) {
  const router = useRouter();
  const [stages, setStages] = useState<StageState[]>(() =>
    STAGES.map((stage) => initial.find((row) => row.stage === stage) ?? { stage, status: "pending", cacheHit: false })
  );
  const [note, setNote] = useState<string | undefined>(live ? "Waiting for a worker…" : undefined);

  useEffect(() => {
    if (!live) return;
    const source = new EventSource(`/api/v1/runs/${encodeURIComponent(runId)}/events`);
    const update = (stage: string, change: Partial<StageState>) => {
      setStages((current) => current.map((row) => (row.stage === stage ? { ...row, ...change } : row)));
    };
    const onEvent = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as RunEvent;
      switch (event.type) {
        case "run.queued":
          setNote("Waiting for a worker…");
          break;
        case "run.started":
          setNote(event.attempt > 1 ? `Running (attempt ${String(event.attempt)})…` : "Running…");
          // A new attempt starts every stage again.
          setStages((current) => current.map((row) => ({ ...row, status: "pending", cacheHit: false })));
          break;
        case "stage.started":
          update(event.stage, { status: "running" });
          break;
        case "stage.finished":
          update(event.stage, { status: "succeeded", cacheHit: event.cacheHit, durationMs: event.durationMs });
          break;
        case "run.failed":
          if (event.willRetry) {
            setNote("The attempt failed; the platform will retry.");
            break;
          }
          source.close();
          setNote(undefined);
          router.refresh();
          break;
        case "run.completed":
          source.close();
          setNote(undefined);
          router.refresh();
          break;
      }
    };
    for (const type of EVENTS) source.addEventListener(type, onEvent);
    return () => {
      source.close();
    };
  }, [live, runId, router]);

  return (
    <section aria-labelledby="stages" className="space-y-3">
      <h2 id="stages" className="font-semibold">
        Stages
      </h2>
      {note !== undefined && (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
      <ol className="grid gap-2 sm:grid-cols-3">
        {stages.map((row) => (
          <li
            key={row.stage}
            data-testid="stage"
            data-status={row.status}
            className="glass-panel flex items-center justify-between rounded-md px-3 py-2 text-sm"
          >
            <span className="font-mono">{row.stage}</span>
            <span
              className={
                row.status === "succeeded"
                  ? "text-safe"
                  : row.status === "failed"
                    ? "text-breaking"
                    : row.status === "running"
                      ? "text-risky"
                      : "text-muted-foreground"
              }
            >
              {row.status === "succeeded" ? (row.cacheHit ? "cached" : "done") : row.status}
              {row.durationMs !== undefined && ` · ${String(row.durationMs)} ms`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
