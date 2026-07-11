import { fail } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/guards";
import { listPaymentViewsForMonth } from "$lib/server/payments/paymentService";
import { listPayoutAccountStatuses } from "$lib/server/payoutAccounts/payoutAccountService";
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

  return {
    month,
    ...settlement,
    payoutAccountStatuses: await listPayoutAccountStatuses(assigneeLogins),
    payments: await listPaymentViewsForMonth(month, assigneeLogins),
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
    const noticeNote =
      result.noticeSkippedReason === "payout_account_missing"
        ? "振込先情報が未登録のため支払い通知書は未作成です。作業者へ振込先の登録を依頼してください。"
        : "振込先情報を復号できなかったため支払い通知書は未作成です。管理者に確認してください。";
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
