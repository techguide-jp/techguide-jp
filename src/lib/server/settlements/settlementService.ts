import { createAuditLog } from "$lib/server/audit/auditRepository";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import { normalizeDateInput } from "$lib/server/payments/paymentDate";
import {
  listChangeRequestsForSettlementContext,
  listWorkSessionsForSettlementContext,
  reviewChangeRequest,
  reviewChangeRequestAndInvalidateCompletion,
} from "$lib/server/work/workRepository";
import {
  buildSettlementSummaries,
  findSummary,
} from "$lib/server/settlements/settlementCalculator";
import { buildSettlementSummariesV2 } from "$lib/server/settlements/settlementCalculatorV2";
import {
  getSnapshot,
  listSnapshots,
  listSnapshotsForMonth,
} from "$lib/server/settlements/snapshotRepository";
import {
  listWorkSubmissions,
  listWorkSubmissionsForMonth,
  upsertWorkSubmission,
} from "$lib/server/settlements/submissionRepository";
import { getPaymentRow } from "$lib/server/payments/paymentRepository";
import { defaultPaymentDueDate } from "$lib/server/payments/paymentDate";
import {
  jstDateString,
  noticeSkipMessage,
  prepareNoticeWriteInput,
} from "$lib/server/notices/noticeService";
import { insertPaymentNotice } from "$lib/server/notices/noticeRepository";
import type { NoticeSkipReason } from "$lib/server/notices/noticeTypes";
import type {
  MonthlySettlementSnapshot,
  MonthlyWorkSubmission,
  WorkSession,
} from "$lib/server/db/schema";
import {
  hashSettlementSummary,
  hasSettlementSnapshotChanges,
  hasWorkSubmissionChanges,
  settlementSnapshotAmount,
  settlementSnapshotHourlyRates,
  settlementSnapshotTimedRewards,
} from "$lib/server/settlements/settlementSnapshot";
import { recordSettlementApproval } from "$lib/server/settlements/settlementApprovalRepository";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";
import { jstMonthRangeUtc, toJstMonth } from "$lib/server/time";
import {
  dispatchPreparedNotification,
  prepareSettlementNotificationSafely,
} from "$lib/server/notifications/notificationService";
import { buildNotificationOperationId } from "$lib/server/notifications/notificationOperation";
import { reconcileCompletionReports } from "$lib/server/completions/completionService";
import {
  listCompletionReportsForMonth,
  listSupplementalPaymentsForMonth,
} from "$lib/server/completions/completionRepository";
import { env } from "$lib/server/env";

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
    ...summary.blockingReasons,
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
    ? env.settlementRuleV2Enabled
      ? hasWorkSubmissionChanges(submission.snapshot, summary)
      : hasSettlementSnapshotChanges(submission.snapshot, summary)
    : true,
  blockingReasons: summary
    ? getWorkSubmissionBlockingReasons(summary)
    : ["対象assigneeの精算データがありません。"],
});

export const loadSettlementMonth = async (month: string) => {
  const { health, issues, projectFetchError } =
    await fetchProjectIssuesForPage();
  const range = jstMonthRangeUtc(month);
  const completionReports = env.settlementRuleV2Enabled
    ? await listCompletionReportsForMonth(month)
    : [];
  if (env.settlementRuleV2Enabled && !projectFetchError) {
    await reconcileCompletionReports(issues);
  }
  const refreshedCompletionReports = env.settlementRuleV2Enabled
    ? await listCompletionReportsForMonth(month)
    : completionReports;
  const settlementIssueRefs = [
    ...issues
      .filter((issue) => issue.closedAt && toJstMonth(issue.closedAt) === month)
      .map((issue) => ({
        repository: issue.repository,
        issueNumber: issue.number,
      })),
    ...refreshedCompletionReports.map((report) => ({
      repository: report.repository,
      issueNumber: report.issueNumber,
    })),
  ].filter(
    (ref, index, refs) =>
      refs.findIndex(
        (candidate) =>
          candidate.repository === ref.repository &&
          candidate.issueNumber === ref.issueNumber,
      ) === index,
  );
  const [sessions, requests, snapshots, submissions] = await Promise.all([
    listWorkSessionsForSettlementContext(range, settlementIssueRefs),
    listChangeRequestsForSettlementContext(range, settlementIssueRefs),
    listSnapshotsForMonth(month),
    listWorkSubmissionsForMonth(month),
  ]);

  let summaries: SettlementSummary[];
  if (env.settlementRuleV2Enabled) {
    const [allSnapshots, allSubmissions, supplementalPayments] =
      await Promise.all([
        listSnapshots(),
        listWorkSubmissions(),
        listSupplementalPaymentsForMonth(month),
      ]);
    const approvedKeys = new Set(
      allSnapshots.map(
        (snapshot) => `${snapshot.month}:${snapshot.assigneeLogin}`,
      ),
    );
    const settledRecords = [
      ...allSnapshots,
      ...allSubmissions.filter(
        (submission) =>
          !approvedKeys.has(`${submission.month}:${submission.assigneeLogin}`),
      ),
    ].sort((a, b) => a.month.localeCompare(b.month));
    const frozenHourlyRates = new Map<string, number | null>();
    for (const record of settledRecords) {
      for (const [key, rate] of settlementSnapshotHourlyRates(
        record.snapshot,
      )) {
        // 作業者ごとにIssueを初めて申請した月の単価を、以後の月と再申請でも維持する。
        if (!frozenHourlyRates.has(key)) frozenHourlyRates.set(key, rate);
      }
    }

    const priorTimedRewardByIssue = new Map<string, number>();
    for (const record of settledRecords) {
      if (record.month === month) continue;
      for (const [key, amount] of settlementSnapshotTimedRewards(
        record.snapshot,
      )) {
        priorTimedRewardByIssue.set(
          key,
          (priorTimedRewardByIssue.get(key) ?? 0) + amount,
        );
      }
    }

    summaries = buildSettlementSummariesV2(month, issues, sessions, requests, {
      completionReports: refreshedCompletionReports,
      supplementalPayments,
      frozenHourlyRates,
      priorTimedRewardByIssue,
    });
  } else {
    summaries = buildSettlementSummaries(month, issues, sessions, requests);
  }
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

type SettlementAssigneeData = Awaited<
  ReturnType<typeof loadSettlementAssignee>
>;

/** 取得済みデータが、支払い情報を更新できる承認済み精算かを確認する。 */
const validateSettlementPaymentData = (
  data: SettlementAssigneeData,
):
  | { ok: true; summary: SettlementSummary }
  | { ok: false; message: string } => {
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
  return { ok: true, summary: data.summary };
};

/** 支払い情報を更新できる、内容変更のない承認済み精算かを確認する。 */
export const validateSettlementPaymentEligibility = async (
  month: string,
  assigneeLogin: string,
): Promise<
  | { ok: true; taxExcludedYen: number; taxIncludedYen: number }
  | { ok: false; message: string }
> => {
  if (env.settlementRuleV2Enabled) {
    const snapshot = await getSnapshot(month, assigneeLogin);
    if (!snapshot) {
      return {
        ok: false,
        message: "未承認の月次精算は支払い情報を更新できません。",
      };
    }
    const taxExcludedYen = settlementSnapshotAmount(
      snapshot.snapshot,
      "taxExcludedYen",
    );
    const taxIncludedYen = settlementSnapshotAmount(
      snapshot.snapshot,
      "taxIncludedYen",
    );
    if (taxExcludedYen === null || taxIncludedYen === null) {
      return {
        ok: false,
        message: "承認済みスナップショットの金額を確認できません。",
      };
    }
    return { ok: true, taxExcludedYen, taxIncludedYen };
  }
  const data = await loadSettlementAssignee(month, assigneeLogin);
  const eligibility = validateSettlementPaymentData(data);
  if (!eligibility.ok) return eligibility;
  return {
    ok: true,
    taxExcludedYen: eligibility.summary.taxExcludedYen,
    taxIncludedYen: eligibility.summary.taxIncludedYen,
  };
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
  if (data.submission && !data.submission.hasChanges) {
    return { ok: false, message: "この内容はすでに月次確定申請済みです。" };
  }

  const wasSubmitted = Boolean(data.submission);
  const submittedAt = new Date();
  const emailNotification = await prepareSettlementNotificationSafely({
    type: "settlement_submitted",
    // 直前に保存した申請版を起点にし、複数タブは束ねつつ変更後の再申請は別操作にする。
    operationId: buildNotificationOperationId(
      "settlement-submitted",
      data.submission?.submittedAt.toISOString() ?? "new",
      hashSettlementSummary(summary),
    ),
    month,
    assigneeLogin,
    workerDisplayName: assigneeLogin,
    occurredAt: submittedAt,
    taxExcludedYen: summary.taxExcludedYen,
    taxIncludedYen: summary.taxIncludedYen,
    isRepeat: wasSubmitted,
  });
  await upsertWorkSubmission(summary, submittedBy, {
    submittedAt,
    ...(emailNotification.mode === "resend"
      ? { notification: emailNotification.write }
      : {}),
  });
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
  await dispatchPreparedNotification(emailNotification);
  return { ok: true };
};

export const approveSettlement = async (
  month: string,
  assigneeLogin: string,
  approvedBy: string,
  scheduledDateInput?: string | null,
): Promise<
  | { ok: true; noticeCreated: boolean; noticeSkippedReason?: NoticeSkipReason }
  | { ok: false; message: string }
> => {
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
  if (env.settlementRuleV2Enabled && data.snapshot) {
    return {
      ok: false,
      message:
        "新しい精算ルールでは承認済みスナップショットを変更できません。遅れて対象化した固定報酬は追加支払いへ計上されます。",
    };
  }

  // 承認時点の宛先・支払い予定日を凍結した通知書スナップショットを、承認確定と
  // 同一トランザクションで保存する。振込先が未登録・復号失敗のときは承認自体は
  // 成立させ、通知書のみスキップする。承認日時は1つだけ生成して両レコードで共有する。
  const now = new Date(
    Math.max(Date.now(), (data.snapshot?.approvedAt.getTime() ?? -1) + 1),
  );
  const approvedAt = now.toISOString();
  const effectiveScheduledDate = scheduledDate.shouldUpdate
    ? scheduledDate.scheduledDate
    : (payment?.scheduledDate ?? defaultPaymentDueDate(month));
  if (
    data.snapshot &&
    !hasSettlementSnapshotChanges(data.snapshot.snapshot, summary) &&
    effectiveScheduledDate ===
      (payment?.scheduledDate ?? defaultPaymentDueDate(month))
  ) {
    return {
      ok: false,
      message: "承認内容と支払い予定日に変更がありません。",
    };
  }
  const prepared = await prepareNoticeWriteInput({
    month,
    assigneeLogin,
    summary,
    scheduledDate: effectiveScheduledDate,
    approvedBy,
    approvedAt,
    issuedOn: jstDateString(now),
    createdBy: approvedBy,
  });
  const emailNotification = await prepareSettlementNotificationSafely({
    type: "settlement_approved",
    operationId: buildNotificationOperationId(
      "settlement-approved",
      data.snapshot?.approvedAt.toISOString() ?? "new",
      hashSettlementSummary(summary),
      effectiveScheduledDate,
    ),
    month,
    assigneeLogin,
    workerDisplayName: assigneeLogin,
    occurredAt: now,
    taxExcludedYen: summary.taxExcludedYen,
    taxIncludedYen: summary.taxIncludedYen,
    scheduledDate: effectiveScheduledDate,
    hasPaymentNotice: prepared.ok,
    isRepeat: Boolean(data.snapshot),
  });

  const approvalRecorded = await recordSettlementApproval({
    summary,
    approvedBy,
    approvedAt,
    expectedApprovedAt: data.snapshot?.approvedAt.toISOString() ?? null,
    ...(scheduledDate.shouldUpdate
      ? { scheduledDate: scheduledDate.scheduledDate }
      : {}),
    ...(prepared.ok ? { notice: prepared.notice } : {}),
    ...(emailNotification.mode === "resend"
      ? { notification: emailNotification.write }
      : {}),
  });

  if (!approvalRecorded) {
    return {
      ok: false,
      message:
        "承認状態が別の操作で更新されました。画面を再読み込みしてください。",
    };
  }

  await dispatchPreparedNotification(emailNotification);

  return prepared.ok
    ? { ok: true, noticeCreated: true }
    : {
        ok: true,
        noticeCreated: false,
        noticeSkippedReason: prepared.reason,
      };
};

/**
 * 管理者による支払い通知書の再作成。承認済みかつ内容変更のない精算について、
 * 現在の振込先・支払い予定日で新しい通知書を append する。過去通知書は上書きしない。
 * 承認日時・承認者は既存の承認スナップショットの値を凍結する。
 */
export const recreateSettlementNotice = async (
  month: string,
  assigneeLogin: string,
  actor: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const data = await loadSettlementAssignee(month, assigneeLogin);
  const eligibility = validateSettlementPaymentData(data);
  if (!eligibility.ok) return eligibility;

  if (!data.summary || !data.snapshot) {
    return { ok: false, message: "承認済みの月次精算がありません。" };
  }

  const payment = await getPaymentRow(month, assigneeLogin);
  const scheduledDate = payment?.scheduledDate ?? defaultPaymentDueDate(month);
  const prepared = await prepareNoticeWriteInput({
    month,
    assigneeLogin,
    summary: data.summary,
    scheduledDate,
    approvedBy: data.snapshot.approvedBy,
    approvedAt: data.snapshot.approvedAt.toISOString(),
    issuedOn: jstDateString(new Date()),
    createdBy: actor,
  });
  if (!prepared.ok) {
    return { ok: false, message: noticeSkipMessage(prepared.reason) };
  }

  await insertPaymentNotice(prepared.notice);
  return { ok: true };
};

export const reviewSettlementChangeRequest = async (
  requestId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  note: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const review = env.settlementRuleV2Enabled
    ? reviewChangeRequestAndInvalidateCompletion
    : reviewChangeRequest;
  const request = await review(requestId, status, reviewedBy, note);
  if (!request) {
    return {
      ok: false,
      message: "修正申請が見つからないか、すでに採否決定済みです。",
    };
  }
  if (!env.settlementRuleV2Enabled) {
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
  }
  return { ok: true };
};
