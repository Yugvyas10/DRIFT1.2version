import { create } from "zustand";
import { PipelineStage, PipelineStageInfo } from "@/types";
import { PIPELINE_STAGES } from "@/constants/pipeline";

interface PipelineState {
  stages: PipelineStageInfo[];
  activeStageId: PipelineStage | null;
  isRunning: boolean;
  activeStageIndex: number;
  setActiveStage: (stageId: PipelineStage) => void;
  startPipelineRun: () => void;
  resetPipeline: () => void;
  updateStageMetrics: (stageId: PipelineStage, metrics: PipelineStageInfo["metrics"]) => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  stages: PIPELINE_STAGES,
  activeStageId: "ingestion",
  isRunning: false,
  activeStageIndex: 0,
  setActiveStage: (stageId) => {
    const idx = get().stages.findIndex((s) => s.id === stageId);
    set({ activeStageId: stageId, activeStageIndex: idx >= 0 ? idx : 0 });
  },
  startPipelineRun: () => {
    set({ isRunning: true, activeStageId: "ingestion", activeStageIndex: 0 });
  },
  resetPipeline: () => {
    set({
      stages: PIPELINE_STAGES.map((s) => ({ ...s, status: "idle" })),
      activeStageId: "ingestion",
      isRunning: false,
      activeStageIndex: 0,
    });
  },
  updateStageMetrics: (stageId, metrics) => {
    set((state) => ({
      stages: state.stages.map((stage) =>
        stage.id === stageId ? { ...stage, metrics: { ...stage.metrics, ...metrics } } : stage
      ),
    }));
  },
}));
