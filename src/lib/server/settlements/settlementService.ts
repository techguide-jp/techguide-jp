import { fetchProjectIssues } from "$lib/server/github/projectClient";
import {
  listChangeRequests,
  listWorkSessions,
  reviewChangeRequest
} from "$lib/server/work/workRepository";
import { buildSettlementSummaries, findSummary } from "$lib/server/settlements/settlementCalculator";
import { getSnapshot, upsertSnapshot } from "$lib/server/settlements/snapshotRepository";

export const loadSettlementMonth = async (month: string) => {
  const [{ health, issues }, sessions, requests] = await Promise.all([
    fetchProjectIssues(),
    listWorkSessions(),
    listChangeRequests()
  ]);

  return {
    health,
    issues,
    sessions,
    requests,
    summaries: buildSettlementSummaries(month, issues, sessions, requests)
  };
};

export const loadSettlementAssignee = async (month: string, assigneeLogin: string) => {
  const data = await loadSettlementMonth(month);
  const summary = findSummary(data.summaries, assigneeLogin);
  const snapshot = await getSnapshot(month, assigneeLogin);
  return { ...data, summary, snapshot };
};

export const approveSettlement = async (
  month: string,
  assigneeLogin: string,
  approvedBy: string
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const { summary } = await loadSettlementAssignee(month, assigneeLogin);
  if (!summary) {
    return { ok: false, message: "対象assigneeの精算データがありません。" };
  }
  if (summary.blockingReasons.length > 0) {
    return { ok: false, message: "未解決の不備があるため月次承認できません。" };
  }

  await upsertSnapshot(summary, approvedBy);
  return { ok: true };
};

export const reviewSettlementChangeRequest = async (
  requestId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  note: string | null
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const request = await reviewChangeRequest(requestId, status, reviewedBy, note);
  if (!request) {
    return { ok: false, message: "修正申請が見つかりません。" };
  }
  return { ok: true };
};
