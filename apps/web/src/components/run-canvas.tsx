"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  CANVAS_STAGES,
  nodeState,
  reportState,
  type CanvasStageId,
  type EngineStageState,
  type NodeState,
  type StageStatus,
} from "@/lib/canvas";

type RunEvent =
  | { type: "run.queued" }
  | { type: "run.started"; attempt: number }
  | { type: "stage.started"; stage: EngineStageState["stage"]; attempt: number }
  | { type: "stage.finished"; stage: EngineStageState["stage"]; cacheHit: boolean; durationMs: number; attempt: number }
  | { type: "run.completed" }
  | { type: "run.failed"; message: string; willRetry: boolean };

const EVENT_TYPES = ["run.queued", "run.started", "stage.started", "stage.finished", "run.completed", "run.failed"];

const STATUS_TEXT: Record<StageStatus, string> = {
  pending: "waiting",
  running: "running",
  succeeded: "done",
  failed: "failed",
  skipped: "skipped",
};

const STATUS_STYLE: Record<StageStatus, string> = {
  pending: "border-border text-muted-foreground",
  running: "border-risky/60 text-risky",
  succeeded: "border-safe/50 text-safe",
  failed: "border-breaking/60 text-breaking",
  skipped: "border-border text-muted-foreground",
};

function describe(state: NodeState): string {
  if (state.status === "succeeded" && state.cached) return "cached";
  return STATUS_TEXT[state.status];
}

/**
 * The run canvas (PLAN M7): the six stages as tabs, each with an inspector panel rendered on the server from the
 * run's stage rows and stored report. While the run is queued or running, it follows
 * `GET /api/v1/runs/{id}/events` (EventSource: the session cookie, and `Last-Event-ID` on reconnect) and moves
 * each stage as its events arrive; when the run ends it reloads the server data.
 */
export function RunCanvas({
  runId,
  live,
  runStatus,
  initialStages,
  panels,
  initialSelected,
}: {
  runId: string;
  live: boolean;
  runStatus: string;
  initialStages: EngineStageState[];
  panels: Record<CanvasStageId, ReactNode>;
  initialSelected: CanvasStageId;
}) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);
  const [status, setStatus] = useState(runStatus);
  const [note, setNote] = useState<string | undefined>(live ? "Waiting for a worker…" : undefined);
  const [selected, setSelected] = useState<CanvasStageId>(initialSelected);
  const tabs = useRef(new Map<CanvasStageId, HTMLButtonElement>());

  useEffect(() => {
    if (!live) return;
    const source = new EventSource(`/api/v1/runs/${encodeURIComponent(runId)}/events`);
    const update = (stage: EngineStageState["stage"], change: Partial<EngineStageState>) => {
      setStages((current) => {
        const known = current.some((row) => row.stage === stage);
        const base: EngineStageState = { stage, status: "pending", cacheHit: false, attempt: 1 };
        return known
          ? current.map((row) => (row.stage === stage ? { ...row, ...change } : row))
          : [...current, { ...base, ...change }];
      });
    };
    const onEvent = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as RunEvent;
      switch (event.type) {
        case "run.queued":
          setStatus("queued");
          setNote("Waiting for a worker…");
          break;
        case "run.started":
          setStatus("running");
          setNote(event.attempt > 1 ? `Running, attempt ${String(event.attempt)}…` : "Running…");
          // A new attempt runs every stage again.
          setStages([]);
          break;
        case "stage.started":
          update(event.stage, { status: "running", attempt: event.attempt });
          break;
        case "stage.finished":
          update(event.stage, {
            status: "succeeded",
            cacheHit: event.cacheHit,
            durationMs: event.durationMs,
            attempt: event.attempt,
          });
          break;
        case "run.failed":
          if (event.willRetry) {
            setNote("The attempt failed; the platform will retry it.");
            break;
          }
          source.close();
          setStatus("failed");
          setNote(undefined);
          router.refresh();
          break;
        case "run.completed":
          source.close();
          setStatus("complete");
          setNote(undefined);
          router.refresh();
          break;
      }
    };
    for (const type of EVENT_TYPES) source.addEventListener(type, onEvent);
    return () => {
      source.close();
    };
  }, [live, runId, router]);

  const states = Object.fromEntries(
    CANVAS_STAGES.map((info) => [info.id, info.id === "report" ? reportState(status) : nodeState(info, stages)])
  ) as Record<CanvasStageId, NodeState>;

  // Arrow keys move between the tabs (WAI-ARIA tabs pattern); Home and End go to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = CANVAS_STAGES.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const id = CANVAS_STAGES[next]?.id;
    if (!id) return;
    setSelected(id);
    tabs.current.get(id)?.focus();
  };

  return (
    <section aria-labelledby="canvas-title" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="canvas-title" className="font-semibold">
          Pipeline
        </h2>
        <p role="status" className="text-sm text-muted-foreground" data-testid="canvas-note">
          {note ?? ""}
        </p>
      </div>
      <div role="tablist" aria-label="Stages" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {CANVAS_STAGES.map((info, index) => {
          const state = states[info.id];
          const isSelected = selected === info.id;
          return (
            <button
              key={info.id}
              ref={(element) => {
                if (element) tabs.current.set(info.id, element);
              }}
              type="button"
              role="tab"
              id={`tab-${info.id}`}
              aria-selected={isSelected}
              aria-controls={`panel-${info.id}`}
              tabIndex={isSelected ? 0 : -1}
              data-testid="canvas-stage"
              data-stage={info.id}
              data-status={state.status}
              data-cached={state.cached}
              onClick={() => {
                setSelected(info.id);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, index);
              }}
              className={`glass-panel flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-sm transition ${STATUS_STYLE[state.status]} ${
                isSelected ? "ring-2 ring-primary" : "hover:border-primary/50"
              }`}
            >
              <span className="text-xs text-muted-foreground">
                {String(index + 1)}. <span className="font-semibold text-foreground">{info.title}</span>
              </span>
              <span data-testid="canvas-stage-state">
                {describe(state)}
                {state.durationMs !== undefined && ` · ${String(state.durationMs)} ms`}
              </span>
            </button>
          );
        })}
      </div>
      {CANVAS_STAGES.map((info) => (
        <div
          key={info.id}
          role="tabpanel"
          id={`panel-${info.id}`}
          aria-labelledby={`tab-${info.id}`}
          hidden={selected !== info.id}
          tabIndex={0}
          className="glass-panel rounded-lg p-5"
          data-testid="inspector"
        >
          {panels[info.id]}
        </div>
      ))}
    </section>
  );
}
