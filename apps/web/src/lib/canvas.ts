import type { StageName } from "@drift/report-schema";

/**
 * The run canvas's six nodes (PLAN §2 objective 1): the engine's stages, with the two Ingest stages shown as one
 * node, and Report & Gate, which is the run's result rather than an engine stage. Vocabulary, not data: what each
 * node shows comes from the run's stage rows, events and stored report.
 */
export type CanvasStageId = "ingest" | "diff" | "corpus" | "verify" | "classify" | "report";

export interface CanvasStageInfo {
  id: CanvasStageId;
  title: string;
  /** The engine stages this node stands for (none for Report & Gate). */
  engine: readonly StageName[];
  /** What the stage does, in one line (shown in the inspector). */
  purpose: string;
}

export const CANVAS_STAGES: readonly CanvasStageInfo[] = [
  {
    id: "ingest",
    title: "Ingest",
    engine: ["ingest.base", "ingest.head"],
    purpose: "Parse and validate both contracts, resolve local $refs, normalise them and hash them.",
  },
  {
    id: "diff",
    title: "Diff",
    engine: ["diff"],
    purpose: "Find every change between the contracts, with its direction and location.",
  },
  {
    id: "corpus",
    title: "Corpus",
    engine: ["corpus"],
    purpose: "Read, route, sample and redact recorded traffic for the operations that changed.",
  },
  {
    id: "verify",
    title: "Verify",
    engine: ["verify"],
    purpose: "Validate recorded and synthetic samples against both contracts: old accepts, new rejects is evidence.",
  },
  {
    id: "classify",
    title: "Classify",
    engine: ["classify"],
    purpose: "Label each change BREAKING, RISKY or SAFE with the rules and the policy, and decide the gate.",
  },
  {
    id: "report",
    title: "Report & Gate",
    engine: [],
    purpose: "Store the report in every format and pass or fail the gate.",
  },
];

export type StageStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

/** One engine stage as the canvas knows it: from the stage rows, then from live events. */
export interface EngineStageState {
  stage: StageName;
  status: StageStatus;
  cacheHit: boolean;
  attempt: number;
  durationMs?: number;
}

export interface NodeState {
  status: StageStatus;
  /** True when every engine stage of the node was reused from the cache. */
  cached: boolean;
  durationMs?: number;
}

/** A canvas node's state from its engine stages: failed, running, done (all of them) or pending. */
export function nodeState(info: CanvasStageInfo, stages: readonly EngineStageState[]): NodeState {
  const own = stages.filter((stage) => info.engine.includes(stage.stage));
  if (own.length === 0) return { status: "pending", cached: false };
  const done = own.filter((stage) => stage.status === "succeeded");
  const durations = own.map((stage) => stage.durationMs).filter((ms) => ms !== undefined);
  const status: StageStatus = own.some((stage) => stage.status === "failed")
    ? "failed"
    : own.some((stage) => stage.status === "running")
      ? "running"
      : done.length === info.engine.length
        ? "succeeded"
        : done.length > 0
          ? "running"
          : "pending";
  return {
    status,
    cached: done.length === info.engine.length && done.every((stage) => stage.cacheHit),
    ...(durations.length === own.length && durations.length > 0
      ? { durationMs: durations.reduce((total, ms) => total + ms, 0) }
      : {}),
  };
}

/** Report & Gate: done when the run is complete, failed when it failed, otherwise waiting. */
export function reportState(runStatus: string): NodeState {
  if (runStatus === "complete") return { status: "succeeded", cached: false };
  if (runStatus === "failed") return { status: "failed", cached: false };
  return { status: "pending", cached: false };
}

/** Which node a report diagnostic belongs to (by its code; anything new shows under Report & Gate). */
export function diagnosticStage(code: string): CanvasStageId {
  switch (code) {
    case "NO_TRAFFIC":
    case "TRAFFIC_MALFORMED":
      return "corpus";
    case "SYNTHETIC_EVIDENCE":
    case "SYNTHETIC_BUDGET":
    case "UNATTRIBUTED_FAILURES":
    case "NOT_CHECKED":
      return "verify";
    case "SUPPRESSION_EXPIRED":
    case "SUPPRESSION_UNUSED":
      return "classify";
    default:
      return "report";
  }
}

/** Bytes as people read them. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/** The nodes a run can be re-run from, and what changes there (see the re-run form). */
export type RerunStage = "corpus" | "verify" | "classify" | "report";

/** Largest file a re-run takes from the browser; larger corpora go through `drift rerun <id> --traffic`. */
export const MAX_BROWSER_UPLOAD_BYTES = 25 * 1024 * 1024;
