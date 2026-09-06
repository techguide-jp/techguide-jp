import { fail } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/guards";
import { listPaymentViewsForMonth } from "$lib/server/payments/paymentService";
import { listPayoutAccountStatuses } from "$lib/server/payoutAccounts/payoutAccountService";
import {
  listAvailableNoticeAssignees,
  noticeSkipMessage,
} from "$lib/server/notices/noticeService";
import {
  approveSettlement,
  loadSettlementMonth,
  reviewSettlementChangeRequest,
} from "$lib/server/settlements/settlementService";
import { env } from "$lib/server/env";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import { backfillIssueCompletion } from "$lib/server/completions/completionService";
import { listCompletionBackfillCandidates } from "$lib/server/completions/completionBackfillService";
import {
  listSupplementalPaymentViews,
  markSupplementalPaymentPaid,
  revertSupplementalPayment,
  scheduleSupplementalPayment,
} from "$lib/server/supplementalPayments/supplementalPaymentService";

export const load = async (event) => {
  requireAdmin(event);
  const month = event.params.month;
  const settlement = await loadSettlementMonth(month);
  const assigneeLogins = settlement.summaries.map(
    (summary) => summary.assigneeLogin,
  );

  const [
    payoutAccountStatuses,
    payments,
    noticeAssignees,
    supplementalPayments,
    completionBackfillCandidates,
  ] = await Promise.all([
    listPayoutAccountStatuses(assigneeLogins),
    listPaymentViewsForMonth(month, assigneeLogins),
    listAvailableNoticeAssignees(month),
    env.settlementRuleV2Enabled
      ? listSupplementalPaymentViews(month)
      : Promise.resolve([]),
    listCompletionBackfillCandidates(settlement.issues),
  ]);

  return {
    month,
    ...settlement,
    payoutAccountStatuses,
    payments,
    noticeAssignees,
    supplementalPayments,
    completionBackfillCandidates,
    settlementRuleV2Enabled: env.settlementRuleV2Enabled,
  };
};

export const actions = {
  approve: async (event) => {
    const user = requireAdmin(event);
    const formData = await event.request.formData();
    const assigneeLogin = String(formData.get("assigneeLogin") ?? "");
    const scheduledDate = String(formData.get("scheduledDate") ?? "");
    const result = await approveSettlement(
      event.params.month,
      assigneeLogin,
      user.login,
      scheduledDate,
    );
    if (!result.ok) return fail(400, { message: result.message });
    const approved = `${assigneeLogin} の月次精算を承認しました。`;
    if (result.noticeCreated) {
      return { message: `${approved}支払い通知書を作成しました。` };
    }
    const noticeNote = result.noticeSkippedReason
      ? noticeSkipMessage(result.noticeSkippedReason)
      : "支払い通知書を作成できませんでした。";
    return { message: `${approved}${noticeNote}` };
  },
  reviewRequest: async (event) => {
    const user = requireAdmin(event);
    const formData = await event.request.formData();
    const requestId = String(formData.get("requestId") ?? "");
    const status = String(formData.get("status") ?? "");
    const note = String(formData.get("note") ?? "") || null;

    if (status !== "approved" && status !== "rejected") {
      return fail(400, { message: "申請の採否が不正です。" });
    }

    const result = await reviewSettlementChangeRequest(
      requestId,
      status,
      user.login,
      note,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return {
      message:
        status === "approved"
          ? "修正申請を承認しました。"
          : "修正申請を却下しました。",
    };
  },
  backfillCompletion: async (event) => {
    const user = requireAdmin(event);
    const project = await fetchProjectIssuesForPage();
    if (project.projectFetchError) {
      return fail(503, { message: project.projectFetchError });
    }
    const result = await backfillIssueCompletion(
      await event.request.formData(),
      project.issues,
      user.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "証跡付きの完了報告を移行登録しました。" };
  },
  scheduleSupplemental: async (event) => {
    const user = requireAdmin(event);
    const formData = await event.request.formData();
    const result = await scheduleSupplementalPayment({
      id: String(formData.get("supplementalPaymentId") ?? ""),
      scheduledDateInput: String(formData.get("scheduledDate") ?? ""),
      actorLogin: user.login,
    });
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "追加支払いの予定日と通知書を確定しました。" };
  },
  markSupplementalPaid: async (event) => {
    const user = requireAdmin(event);
    const formData = await event.request.formData();
    const result = await markSupplementalPaymentPaid({
      id: String(formData.get("supplementalPaymentId") ?? ""),
      paidOnInput: String(formData.get("paidOn") ?? ""),
      actorLogin: user.login,
    });
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "追加支払いを支払い済みにしました。" };
  },
  revertSupplemental: async (event) => {
    const user = requireAdmin(event);
    const formData = await event.request.formData();
    const result = await revertSupplementalPayment({
      id: String(formData.get("supplementalPaymentId") ?? ""),
      actorLogin: user.login,
    });
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "追加支払いを未払いへ戻しました。" };
  },
};
