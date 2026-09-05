import type { IssueCompletionReport } from "$lib/server/db/schema";

export type CompletionReportView = IssueCompletionReport & {
  state: "reported" | "completion_waiting" | "eligible" | "superseded";
};

export type CompletionReportWriteInput = {
  id: string;
  projectItemId: string;
  repository: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  assigneeLogin: string;
  settlementMonth: string;
  reportedAt: Date;
  rewardMode: "固定" | "ハイブリッド";
  fixedRewardYen: number;
  source: "worker" | "admin_backfill";
  evidenceUrl?: string;
  evidenceNote?: string;
  createdBy: string;
};
