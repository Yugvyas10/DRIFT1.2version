import { create } from "zustand";
import { PipelineStage, PipelineStageInfo } from "@/types";
import { PIPELINE_STAGES } from "@/constants/pipeline";

interface PipelineState {
  stages: PipelineStageInfo[];
  activeStageId: PipelineStage;
  activeStageIndex: number;
  isPlaying: boolean;
  speed: number;
  setActiveStageIndex: (index: number) => void;
  setActiveStageId: (stageId: PipelineStage) => void;
  setIsPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  stepNext: () => void;
  stepPrev: () => void;
  resetPipeline: () => void;
  retryStage: () => void;
  cancelPipeline: () => void;
  updateStageMetrics: (
    stageId: PipelineStage,
    metrics: PipelineStageInfo["metrics"]
  ) => void;
}

const updateStageStatuses = (
  stages: PipelineStageInfo[],
  activeIdx: number
): PipelineStageInfo[] => {
  return stages.map((stage, idx) => {
    if (idx < activeIdx) {
      return { ...stage, status: "completed" };
    } else if (idx === activeIdx) {
      return { ...stage, status: "running" };
    } else {
      return { ...stage, status: "idle" };
    }
  });
};

export const usePipelineStore = create<PipelineState>((set, get) => ({
  stages: updateStageStatuses(PIPELINE_STAGES, 0),
  activeStageId: PIPELINE_STAGES[0].id,
  activeStageIndex: 0,
  isPlaying: true,
  speed: 1,

  setActiveStageIndex: (index: number) => {
    const safeIdx = Math.max(0, Math.min(PIPELINE_STAGES.length - 1, index));
    const targetStage = PIPELINE_STAGES[safeIdx];
    set((state) => ({
      activeStageIndex: safeIdx,
      activeStageId: targetStage.id,
      stages: updateStageStatuses(state.stages, safeIdx),
    }));
  },

  setActiveStageId: (stageId: PipelineStage) => {
    const idx = get().stages.findIndex((s) => s.id === stageId);
    const safeIdx = idx >= 0 ? idx : 0;
    set((state) => ({
      activeStageId: stageId,
      activeStageIndex: safeIdx,
      stages: updateStageStatuses(state.stages, safeIdx),
    }));
  },

  setIsPlaying: (playing: boolean) => {
    set({ isPlaying: playing });
  },

  setSpeed: (speed: number) => {
    set({ speed });
  },

  stepNext: () => {
    const nextIdx = Math.min(
      PIPELINE_STAGES.length - 1,
      get().activeStageIndex + 1
    );
    get().setActiveStageIndex(nextIdx);
  },

  stepPrev: () => {
    const prevIdx = Math.max(0, get().activeStageIndex - 1);
    get().setActiveStageIndex(prevIdx);
  },

  resetPipeline: () => {
    set({
      activeStageIndex: 0,
      activeStageId: PIPELINE_STAGES[0].id,
      isPlaying: false,
      stages: PIPELINE_STAGES.map((s, idx) => ({
        ...s,
        status: idx === 0 ? "running" : "idle",
      })),
    });
  },

  retryStage: () => {
    const currentIdx = get().activeStageIndex;
    set((state) => ({
      isPlaying: true,
      stages: state.stages.map((stage, idx) =>
        idx === currentIdx ? { ...stage, status: "running" } : stage
      ),
    }));
  },

  cancelPipeline: () => {
    const currentIdx = get().activeStageIndex;
    set((state) => ({
      isPlaying: false,
      stages: state.stages.map((stage, idx) =>
        idx === currentIdx ? { ...stage, status: "failed" } : stage
      ),
    }));
  },

  updateStageMetrics: (stageId, metrics) => {
    set((state) => ({
      stages: state.stages.map((stage) =>
        stage.id === stageId
          ? { ...stage, metrics: { ...stage.metrics, ...metrics } }
          : stage
      ),
    }));
  },
}));
