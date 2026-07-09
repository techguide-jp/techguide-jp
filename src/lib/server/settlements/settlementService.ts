import { createAuditLog } from "$lib/server/audit/auditRepository";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import { upsertPaymentScheduledDate } from "$lib/server/payments/paymentRepository";
import { normalizeDateInput } from "$lib/server/payments/paymentDate";
import {
  listChangeRequestsForSettlementContext,
  listWorkSessionsForSettlementContext,
  reviewChangeRequest,
} from "$lib/server/work/workRepository";
import {
  buildSettlementSummaries,
  findSummary,
} from "$lib/server/settlements/settlementCalculator";
import {
  getSnapshot,
  listSnapshotsForMonth,
  upsertSnapshot,
} from "$lib/server/settlements/snapshotRepository";
import {
  listWorkSubmissionsForMonth,
  upsertWorkSubmission,
} from "$lib/server/settlements/submissionRepository";
import { getPaymentRow } from "$lib/server/payments/paymentRepository";
import type {
  MonthlySettlementSnapshot,
  MonthlyWorkSubmission,
  WorkSession,
} from "$lib/server/db/schema";
import {
  hasSettlementSnapshotChanges,
  settlementSnapshotAmount,
} from "$lib/server/settlements/settlementSnapshot";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";
import { jstMonthRangeUtc, toJstMonth } from "$lib/server/time";

const PROJECT_FETCH_BLOCKING_REASON =
  "GitHub Projectを取得できないため、精算額を確定できません。";

const parseApprovalScheduledDate = (
  scheduledDateInput: string | null | undefined,
):
  | { ok: true; shouldUpdate: false; scheduledDate: null }
  | { ok: true; shouldUpdate: true; scheduledDate: string }
  | { ok: false; message: string } => {
  if (scheduledDateInput === null || scheduledDateInput === undefined) {
    return { ok: true, shouldUpdate: false, scheduledDate: null };
  }

  const scheduledDate = normalizeDateInput(scheduledDateInput);
  if (!scheduledDate) {
    return {
      ok: false,
      message: "支払い予定日はYYYY-MM-DD形式で入力してください。",
    };
  }

  return { ok: true, shouldUpdate: true, scheduledDate };
};

const toSnapshotMeta = (
  snapshot: MonthlySettlementSnapshot,
  summary: SettlementSummary | undefined,
) => ({
  assigneeLogin: snapshot.assigneeLogin,
  approvedBy: snapshot.approvedBy,
  approvedAt: snapshot.approvedAt,
  taxExcludedYen: settlementSnapshotAmount(snapshot.snapshot, "taxExcludedYen"),
  taxIncludedYen: settlementSnapshotAmount(snapshot.snapshot, "taxIncludedYen"),
  hasChanges: summary
    ? hasSettlementSnapshotChanges(snapshot.snapshot, summary)
    : true,
});

const isOpenSession = (session: WorkSession): boolean =>
  !session.endedAt && !session.excludedAt;

export const getWorkSubmissionBlockingReasons = (
  summary: SettlementSummary,
): string[] => {
  return [
    ...summary.pendingRequests.map(
      (request) =>
        `未処理の修正申請: ${request.repository}#${request.issueNumber}`,
    ),
    ...summary.lines.flatMap((line) =>
      line.sessions
        .filter(isOpenSession)
        .map(
          (session) =>
            `終了していない稼働ログ: ${session.repository}#${session.issueNumber}`,
        ),
    ),
    ...summary.unsettledProjectIssues.flatMap((line) =>
      line.sessions
        .filter(isOpenSession)
        .map(
          (session) =>
            `終了していない未精算予定ログ: ${session.repository}#${session.issueNumber}`,
        ),
    ),
    ...summary.unsettledIssueSessions
      .filter(isOpenSession)
      .map(
        (session) =>
          `終了していない未精算予定ログ: ${session.repository}#${session.issueNumber}`,
      ),
  ];
};

const toSubmissionMeta = (
  submission: MonthlyWorkSubmission,
  summary: SettlementSummary | undefined,
) => ({
  assigneeLogin: submission.assigneeLogin,
  submittedBy: submission.submittedBy,
  submittedAt: submission.submittedAt,
  hasChanges: summary
    ? hasSettlementSnapshotChanges(submission.snapshot, summary)
    : true,
  blockingReasons: summary
    ? getWorkSubmissionBlockingReasons(summary)
    : ["対象assigneeの精算データがありません。"],
});

export const loadSettlementMonth = async (month: string) => {
  const { health, issues, projectFetchError } =
    await fetchProjectIssuesForPage();
  const range = jstMonthRangeUtc(month);
  const closedIssueRefs = issues
    .filter((issue) => issue.closedAt && toJstMonth(issue.closedAt) === month)
    .map((issue) => ({
      repository: issue.repository,
      issueNumber: issue.number,
    }));
  const [sessions, requests, snapshots, submissions] = await Promise.all([
    listWorkSessionsForSettlementContext(range, closedIssueRefs),
    listChangeRequestsForSettlementContext(range, closedIssueRefs),
    listSnapshotsForMonth(month),
    listWorkSubmissionsForMonth(month),
  ]);

  const summaries = buildSettlementSummaries(month, issues, sessions, requests);
  const summaryByAssignee = new Map(
    summaries.map((summary) => [summary.assigneeLogin, summary]),
  );

  return {
    health,
    issues,
    sessions,
    requests,
    summaries,
    projectFetchError,
    snapshots: snapshots.map((snapshot) =>
      toSnapshotMeta(snapshot, summaryByAssignee.get(snapshot.assigneeLogin)),
    ),
    submissions: submissions.map((submission) =>
      toSubmissionMeta(
        submission,
        summaryByAssignee.get(submission.assigneeLogin),
      ),
    ),
  };
};

export const loadSettlementAssignee = async (
  month: string,
  assigneeLogin: string,
) => {
  const data = await loadSettlementMonth(month);
  const summary = findSummary(data.summaries, assigneeLogin);
  const snapshot = await getSnapshot(month, assigneeLogin);
  const submission =
    data.submissions.find((entry) => entry.assigneeLogin === assigneeLogin) ??
    null;
  const projectFetchBlockingReasons = data.projectFetchError
    ? [PROJECT_FETCH_BLOCKING_REASON]
    : [];
  return {
    ...data,
    summary,
    snapshot,
    submission,
    submissionBlockingReasons: summary
      ? [
          ...projectFetchBlockingReasons,
          ...getWorkSubmissionBlockingReasons(summary),
        ]
      : projectFetchBlockingReasons,
  };
};

/** 支払い情報を更新できる、内容変更のない承認済み精算かを確認する。 */
export const validateSettlementPaymentEligibility = async (
  month: string,
  assigneeLogin: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const data = await loadSettlementAssignee(month, assigneeLogin);
  if (data.projectFetchError) {
    return { ok: false, message: PROJECT_FETCH_BLOCKING_REASON };
  }
  if (!data.summary) {
    return { ok: false, message: "対象assigneeの精算データがありません。" };
  }
  if (!data.summary.approvalRequired) {
    return {
      ok: false,
      message: "精算対象がないため支払い情報を更新できません。",
    };
  }
  if (!data.snapshot) {
    return {
      ok: false,
      message: "未承認の月次精算は支払い情報を更新できません。",
    };
  }
  if (hasSettlementSnapshotChanges(data.snapshot.snapshot, data.summary)) {
    return {
      ok: false,
      message:
        "承認後に内容が変更されています。再承認後に支払い情報を更新してください。",
    };
  }
  return { ok: true };
};

export const submitSettlementWork = async (
  month: string,
  assigneeLogin: string,
  submittedBy: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (assigneeLogin !== submittedBy) {
    return { ok: false, message: "本人以外の月次確定申請はできません。" };
  }

  const data = await loadSettlementAssignee(month, assigneeLogin);
  if (data.projectFetchError) {
    return { ok: false, message: PROJECT_FETCH_BLOCKING_REASON };
  }
  const { summary } = data;
  if (!summary) {
    return { ok: false, message: "対象assigneeの精算データがありません。" };
  }
  if (!summary.approvalRequired) {
    return { ok: false, message: "精算対象がないため月次確定申請は不要です。" };
  }

  const blockingReasons = getWorkSubmissionBlockingReasons(summary);
  if (blockingReasons.length > 0) {
    return {
      ok: false,
      message:
        "未完了の入力や未処理の修正申請があるため月次確定申請できません。",
    };
  }

  await upsertWorkSubmission(summary, submittedBy);
  await createAuditLog({
    actorLogin: submittedBy,
    action: "monthly_work_submitted",
    targetType: "monthly_work_submission",
    targetId: `${month}:${assigneeLogin}`,
    details: {
      month,
      assigneeLogin,
      taxExcludedYen: summary.taxExcludedYen,
      taxIncludedYen: summary.taxIncludedYen,
    },
  });
  return { ok: true };
};

export const approveSettlement = async (
  month: string,
  assigneeLogin: string,
  approvedBy: string,
  scheduledDateInput?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const scheduledDate = parseApprovalScheduledDate(scheduledDateInput);
  if (!scheduledDate.ok) return scheduledDate;

  const data = await loadSettlementAssignee(month, assigneeLogin);
  if (data.projectFetchError) {
    return { ok: false, message: PROJECT_FETCH_BLOCKING_REASON };
  }
  const { summary, submission } = data;
  if (!summary) {
    return { ok: false, message: "対象assigneeの精算データがありません。" };
  }
  if (!summary.approvalRequired) {
    return { ok: false, message: "精算対象がないため月次承認は不要です。" };
  }
  if (!submission) {
    return {
      ok: false,
      message: "稼働者の月次確定申請がないため月次承認できません。",
    };
  }
  if (submission.hasChanges) {
    return {
      ok: false,
      message:
        "稼働者の月次確定申請後に内容が変更されています。再申請が必要です。",
    };
  }
  if (submission.blockingReasons.length > 0) {
    return {
      ok: false,
      message: "未完了の入力や未処理の修正申請があるため月次承認できません。",
    };
  }
  if (summary.blockingReasons.length > 0) {
    return { ok: false, message: "未解決の不備があるため月次承認できません。" };
  }

  const payment = await getPaymentRow(month, assigneeLogin);
  if (payment?.status === "paid") {
    return {
      ok: false,
      message:
        "支払い済みの月次精算は再承認できません。先に支払い済み登録を取り消してください。",
    };
  }

  await upsertSnapshot(summary, approvedBy);
  if (scheduledDate.shouldUpdate) {
    await upsertPaymentScheduledDate({
      month,
      assigneeLogin,
      scheduledDate: scheduledDate.scheduledDate,
    });
  }
  await createAuditLog({
    actorLogin: approvedBy,
    action: "monthly_settlement_approved",
    targetType: "monthly_settlement_snapshot",
    targetId: `${month}:${assigneeLogin}`,
    details: {
      month,
      assigneeLogin,
      taxExcludedYen: summary.taxExcludedYen,
      taxIncludedYen: summary.taxIncludedYen,
      ...(scheduledDate.shouldUpdate
        ? { scheduledDate: scheduledDate.scheduledDate }
        : {}),
    },
  });
  return { ok: true };
};

export const reviewSettlementChangeRequest = async (
  requestId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  note: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const request = await reviewChangeRequest(
    requestId,
    status,
    reviewedBy,
    note,
  );
  if (!request) {
    return {
      ok: false,
      message: "修正申請が見つからないか、すでに採否決定済みです。",
    };
  }
  await createAuditLog({
    actorLogin: reviewedBy,
    action: "work_log_change_reviewed",
    targetType: "work_log_change_request",
    targetId: request.id,
    details: {
      status,
      assigneeLogin: request.assigneeLogin,
      repository: request.repository,
      issueNumber: request.issueNumber,
      note,
    },
  });
  return { ok: true };
};
