import { describe, expect, it } from "vitest";
import { CANVAS_STAGES, diagnosticStage, formatBytes, nodeState, reportState, type EngineStageState } from "./canvas";

const ingest = CANVAS_STAGES[0];
const diff = CANVAS_STAGES[1];
if (!ingest || !diff) throw new Error("the canvas has six stages");

const stage = (name: EngineStageState["stage"], change: Partial<EngineStageState> = {}): EngineStageState => ({
  stage: name,
  status: "succeeded",
  cacheHit: false,
  attempt: 1,
  ...change,
});

describe("the canvas", () => {
  it("has the six nodes of the pipeline, covering every engine stage once", () => {
    expect(CANVAS_STAGES.map((info) => info.title)).toEqual([
      "Ingest",
      "Diff",
      "Corpus",
      "Verify",
      "Classify",
      "Report & Gate",
    ]);
    expect(CANVAS_STAGES.flatMap((info) => info.engine)).toEqual([
      "ingest.base",
      "ingest.head",
      "diff",
      "corpus",
      "verify",
      "classify",
    ]);
  });

  it("derives a node's state from its engine stages", () => {
    expect(nodeState(ingest, [])).toEqual({ status: "pending", cached: false });
    expect(nodeState(ingest, [stage("ingest.base", { durationMs: 3 })])).toMatchObject({ status: "running" });
    expect(nodeState(ingest, [stage("ingest.base", { status: "running" })])).toMatchObject({ status: "running" });
    expect(
      nodeState(ingest, [stage("ingest.base", { durationMs: 3 }), stage("ingest.head", { status: "failed" })])
    ).toMatchObject({ status: "failed" });
    expect(
      nodeState(ingest, [
        stage("ingest.base", { cacheHit: true, durationMs: 3 }),
        stage("ingest.head", { cacheHit: true, durationMs: 4 }),
      ])
    ).toEqual({ status: "succeeded", cached: true, durationMs: 7 });
    // One computed stage makes the node computed; a stage without a time leaves the node without one.
    expect(nodeState(ingest, [stage("ingest.base", { cacheHit: true }), stage("ingest.head")])).toEqual({
      status: "succeeded",
      cached: false,
    });
    expect(nodeState(diff, [stage("ingest.base")])).toEqual({ status: "pending", cached: false });
  });

  it("shows Report & Gate from the run's status", () => {
    expect(reportState("complete").status).toBe("succeeded");
    expect(reportState("failed").status).toBe("failed");
    expect(reportState("running").status).toBe("pending");
  });

  it("puts each diagnostic under its stage", () => {
    expect(diagnosticStage("NO_TRAFFIC")).toBe("corpus");
    expect(diagnosticStage("TRAFFIC_MALFORMED")).toBe("corpus");
    for (const code of ["SYNTHETIC_EVIDENCE", "SYNTHETIC_BUDGET", "UNATTRIBUTED_FAILURES", "NOT_CHECKED"]) {
      expect(diagnosticStage(code)).toBe("verify");
    }
    expect(diagnosticStage("SUPPRESSION_EXPIRED")).toBe("classify");
    expect(diagnosticStage("SUPPRESSION_UNUSED")).toBe("classify");
    expect(diagnosticStage("SOMETHING_NEW")).toBe("report");
  });

  it("writes sizes as people read them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KiB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MiB");
  });
});
