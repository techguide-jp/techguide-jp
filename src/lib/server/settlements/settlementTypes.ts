import type { WorkLogChangeRequest, WorkSession } from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";

export type SettlementIssueLine = {
  issue: ProjectIssue;
  assigneeLogin: string | null;
  fixedRewardYen: number;
  workMinutes: number;
  timedRewardYen: number;
  taxExcludedYen: number;
  warnings: string[];
  sessions: WorkSession[];
};

export type UnclosedProjectIssueLine = {
  issue: ProjectIssue;
  sessions: WorkSession[];
  workMinutes: number;
};

export type SettlementSummary = {
  month: string;
  assigneeLogin: string;
  fixedRewardYen: number;
  timedRewardYen: number;
  taxExcludedYen: number;
  taxYen: number;
  taxIncludedYen: number;
  lines: SettlementIssueLine[];
  pendingRequests: WorkLogChangeRequest[];
  unclosedProjectIssues: UnclosedProjectIssueLine[];
  unclosedIssueSessions: WorkSession[];
  approvalRequired: boolean;
  blockingReasons: string[];
};
