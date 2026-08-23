import { fail } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/guards";
import { listPaymentViewsForMonth } from "$lib/server/payments/paymentService";
import { listPayoutAccountStatuses } from "$lib/server/payoutAccounts/payoutAccountService";
import {
  createNotificationOperationId,
  parseNotificationOperationId,
} from "$lib/server/notifications/notificationOperation";
import {
  listAvailableNoticeAssignees,
  noticeSkipMessage,
} from "$lib/server/notices/noticeService";
import {
  approveSettlement,
  loadSettlementMonth,
  reviewSettlementChangeRequest,
} from "$lib/server/settlements/settlementService";

export const load = async (event) => {
  requireAdmin(event);
  const month = event.params.month;
  const settlement = await loadSettlementMonth(month);
  const assigneeLogins = settlement.summaries.map(
    (summary) => summary.assigneeLogin,
  );

  const [payoutAccountStatuses, payments, noticeAssignees] = await Promise.all([
    listPayoutAccountStatuses(assigneeLogins),
    listPaymentViewsForMonth(month, assigneeLogins),
    listAvailableNoticeAssignees(month),
  ]);

  return {
    month,
    notificationOperationId: createNotificationOperationId(),
    ...settlement,
    payoutAccountStatuses,
    payments,
    noticeAssignees,
  };
};

export const actions = {
  approve: async (event) => {
    const user = requireAdmin(event);
    const formData = await event.request.formData();
    const assigneeLogin = String(formData.get("assigneeLogin") ?? "");
    const scheduledDate = String(formData.get("scheduledDate") ?? "");
    const notificationOperationId = parseNotificationOperationId(
      formData.get("notificationOperationId"),
    );
    // 画面の二重送信防止だけではHTTP再送を防げないため、サーバーでも操作IDを必須にする。
    if (!notificationOperationId) {
      return fail(400, {
        message: "操作情報が不正です。画面を再読み込みしてください。",
      });
    }
    const result = await approveSettlement(
      event.params.month,
      assigneeLogin,
      user.login,
      notificationOperationId,
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
};
