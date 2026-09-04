import type {
  IssueCompletionReport,
  SupplementalPayment,
  WorkLogChangeRequest,
  WorkSession,
} from "$lib/server/db/schema";
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
  /** 月またぎログを対象月分だけ表示・計算するための分数。 */
  sessionMinutesById?: Record<string, number>;
  /** 初回の月次確定申請で固定された時間単価。 */
  hourlyRateYenSnapshot?: number | null;
  completionReportId?: string | null;
};

export type UnsettledProjectIssueReason =
  | "open_in_progress"
  | "closed_not_done"
  | "completion_not_reported"
  | "merge_waiting";

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
  completionReports?: IssueCompletionReport[];
  supplementalPayments?: SupplementalPayment[];
};
