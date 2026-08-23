import { fail } from "@sveltejs/kit";
import { requireAdmin, requireSelfOrAdmin } from "$lib/server/auth/guards";
import {
  getPaymentForViewer,
  markSettlementPaid,
  revertSettlementPayment,
  updatePaymentScheduledDate,
} from "$lib/server/payments/paymentService";
import { getPayoutAccountStatus } from "$lib/server/payoutAccounts/payoutAccountService";
import {
  createNotificationOperationId,
  parseNotificationOperationId,
} from "$lib/server/notifications/notificationOperation";
import { hasSettlementSnapshotChanges } from "$lib/server/settlements/settlementSnapshot";
import {
  loadSettlementAssignee,
  submitSettlementWork,
} from "$lib/server/settlements/settlementService";

export const load = async (event) => {
  requireSelfOrAdmin(event, event.params.assignee);
  const assignee = event.params.assignee;
  const settlement = await loadSettlementAssignee(event.params.month, assignee);
  const paymentEditable = Boolean(
    settlement.summary &&
    settlement.snapshot &&
    !hasSettlementSnapshotChanges(
      settlement.snapshot.snapshot,
      settlement.summary,
    ),
  );

  return {
    month: event.params.month,
    assignee,
    notificationOperationId: createNotificationOperationId(),
    payoutAccountStatus: await getPayoutAccountStatus(assignee),
    payment: await getPaymentForViewer(
      event.params.month,
      assignee,
      event.locals.user,
    ),
    paymentEditable,
    ...settlement,
  };
};

export const actions = {
  submitWork: async (event) => {
    const user = requireSelfOrAdmin(event, event.params.assignee);
    const formData = await event.request.formData();
    const notificationOperationId = parseNotificationOperationId(
      formData.get("notificationOperationId"),
    );
    if (!notificationOperationId) {
      return fail(400, {
        message: "操作情報が不正です。画面を再読み込みしてください。",
      });
    }
    const result = await submitSettlementWork(
      event.params.month,
      event.params.assignee,
      user.login,
      notificationOperationId,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: `${event.params.month} の稼働を確定して申請しました。` };
  },
  markPaid: async (event) => {
    requireAdmin(event);
    const formData = await event.request.formData();
    const paidOn = String(formData.get("paidOn") ?? "");
    const notificationOperationId = parseNotificationOperationId(
      formData.get("notificationOperationId"),
    );
    if (!notificationOperationId) {
      return fail(400, {
        scope: "payment",
        message: "操作情報が不正です。画面を再読み込みしてください。",
      });
    }
    const result = await markSettlementPaid(
      event.params.month,
      event.params.assignee,
      paidOn,
      notificationOperationId,
    );
    if (!result.ok)
      return fail(400, { scope: "payment", message: result.message });
    return { scope: "payment", message: "支払い済みとして登録しました。" };
  },
  revertPayment: async (event) => {
    requireAdmin(event);
    const result = await revertSettlementPayment(
      event.params.month,
      event.params.assignee,
    );
    if (!result.ok)
      return fail(400, { scope: "payment", message: result.message });
    return {
      scope: "payment",
      message: "支払い済み登録を取り消して未処理に戻しました。",
    };
  },
  updatePaymentSchedule: async (event) => {
    requireAdmin(event);
    const formData = await event.request.formData();
    const scheduledDate = String(formData.get("scheduledDate") ?? "");
    const result = await updatePaymentScheduledDate(
      event.params.month,
      event.params.assignee,
      scheduledDate,
    );
    if (!result.ok)
      return fail(400, { scope: "payment", message: result.message });
    return { scope: "payment", message: "支払い予定日を更新しました。" };
  },
};
