export type ThemeMode = "dark" | "light" | "system";

export type PipelineStage = 
  | "ingestion" 
  | "diff_engine" 
  | "traffic_replay" 
  | "classification" 
  | "impact_analysis" 
  | "report_generation";

export interface PipelineStageInfo {
  id: PipelineStage;
  stageNumber: number;
  title: string;
  shortName: string;
  description: string;
  techStack: string[];
  status: "idle" | "running" | "completed" | "failed";
  metrics?: {
    latencyMs?: number;
    itemsProcessed?: number;
    breakingCount?: number;
  };
}

export interface NavItem {
  title: string;
  href: string;
  description?: string;
  badge?: string;
  isExternal?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface MetricData {
  label: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  unit?: string;
  helperText?: string;
}

export interface ContractDiffItem {
  id: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  changeType: "ADDED" | "REMOVED" | "MODIFIED" | "TYPE_MUTATION";
  severity: "NON_BREAKING" | "DEPRECATION" | "BREAKING_POTENTIAL" | "BREAKING_CRITICAL";
  description: string;
  oldSchema?: string;
  newSchema?: string;
}

export interface UserSession {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  };
}
