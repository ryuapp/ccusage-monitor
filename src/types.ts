export interface CcusageBlock {
  startTime?: string;
  actualEndTime?: string;
  totalTokens?: number;
  isActive?: boolean;
  isGap?: boolean;
}

export interface CcusageData {
  blocks: CcusageBlock[];
}

export type PlanType = "pro" | "max5" | "max20" | "custom_max";

export interface MonitorOptions {
  plan: PlanType;
  resetHour?: number;
  timezone: string;
}

export interface TokenUsage {
  totalTokensUsed: number;
  activeSessionTokens: number;
  completedSessionTokens: number;
  lastSessionTokens: number;
  averageTokensPerSession: number;
}
