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

export type UnsettledProjectIssueReason =
  | "open_in_progress"
  | "closed_not_done";

export type UnsettledProjectIssueLine = {
  issue: ProjectIssue;
  sessions: WorkSession[];
  workMinutes: number;
  reason: UnsettledProjectIssueReason;
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
  unsettledProjectIssues: UnsettledProjectIssueLine[];
  unsettledIssueSessions: WorkSession[];
  approvalRequired: boolean;
  blockingReasons: string[];
};
