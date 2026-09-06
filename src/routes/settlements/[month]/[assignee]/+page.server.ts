import { readMonthlyFeedbackInput } from "$lib/monthlyFeedback";
import {
  loadMonthlyFeedbackForViewer,
  saveOwnMonthlyFeedback,
} from "$lib/server/settlements/monthlyFeedbackService";
import { readPreferencesInput } from "$lib/workerPreferences";
import {
  loadPreferencesForViewer,
  updateOwnPreferences,
} from "$lib/server/workers/workerPreferencesService";
import { fail } from "@sveltejs/kit";
import { requireAdmin, requireSelfOrAdmin } from "$lib/server/auth/guards";
import {
  getPaymentForViewer,
  markSettlementPaid,
  revertSettlementPayment,
  updatePaymentScheduledDate,
} from "$lib/server/payments/paymentService";
import { getPayoutAccountStatus } from "$lib/server/payoutAccounts/payoutAccountService";
import { hasSettlementSnapshotChanges } from "$lib/server/settlements/settlementSnapshot";
import {
  loadSettlementAssignee,
  submitSettlementWork,
} from "$lib/server/settlements/settlementService";
import { listSupplementalPaymentViews } from "$lib/server/supplementalPayments/supplementalPaymentService";
import { env } from "$lib/server/env";

export const load = async (event) => {
  const viewer = requireSelfOrAdmin(event, event.params.assignee);
  const assignee = event.params.assignee;
  const settlement = await loadSettlementAssignee(event.params.month, assignee);
  const paymentEditable = Boolean(
    settlement.snapshot &&
    (env.settlementRuleV2Enabled ||
      (settlement.summary &&
        !hasSettlementSnapshotChanges(
          settlement.snapshot.snapshot,
          settlement.summary,
        ))),
  );

  return {
    feedback: await loadMonthlyFeedbackForViewer(
      event.params.month,
      assignee,
      viewer,
    ),
    preferences: await loadPreferencesForViewer(assignee, viewer),
    month: event.params.month,
    assignee,
    payoutAccountStatus: await getPayoutAccountStatus(assignee),
    payment: await getPaymentForViewer(
      event.params.month,
      assignee,
      event.locals.user,
    ),
    paymentEditable,
    supplementalPayments: env.settlementRuleV2Enabled
      ? await listSupplementalPaymentViews(event.params.month, assignee)
      : [],
    settlementRuleV2Enabled: env.settlementRuleV2Enabled,
    ...settlement,
  };
};

export const actions = {
  savePreferences: async (event) => {
    const user = requireSelfOrAdmin(event, event.params.assignee);
    const preferencesInput = readPreferencesInput(
      await event.request.formData(),
    );
    try {
      const result = await updateOwnPreferences(
        event.params.assignee,
        user.login,
        preferencesInput,
      );
      if (!result.ok)
        return fail(400, {
          scope: "preferences",
          message: result.message,
          preferencesInput,
        });
      return { scope: "preferences", message: "現在の希望を保存しました。" };
    } catch {
      return fail(500, {
        scope: "preferences",
        message: "希望を保存できませんでした。時間をおいて再度お試しください。",
        preferencesInput,
      });
    }
  },
  submitWork: async (event) => {
    const user = requireSelfOrAdmin(event, event.params.assignee);
    const feedbackInput = readMonthlyFeedbackInput(
      await event.request.formData(),
    );
    try {
      const result = await submitSettlementWork(
        event.params.month,
        event.params.assignee,
        user.login,
        feedbackInput,
      );
      if (!result.ok)
        return fail(400, {
          scope: "submission",
          message: result.message,
          feedbackInput,
        });
      return {
        scope: "submission",
        message: `${event.params.month} の稼働を確定して申請しました。`,
      };
    } catch {
      return fail(500, {
        scope: "submission",
        message:
          "月次確定申請を保存できませんでした。時間をおいて再度お試しください。",
        feedbackInput,
      });
    }
  },
  saveFeedback: async (event) => {
    const user = requireSelfOrAdmin(event, event.params.assignee);
    const feedbackInput = readMonthlyFeedbackInput(
      await event.request.formData(),
    );
    if (!feedbackInput)
      return fail(400, {
        scope: "feedback",
        message: "入力内容を確認してください。",
      });
    try {
      const result = await saveOwnMonthlyFeedback(
        event.params.month,
        event.params.assignee,
        user.login,
        feedbackInput,
      );
      if (!result.ok)
        return fail(400, {
          scope: "feedback",
          message: result.message,
          feedbackInput,
        });
      return { scope: "feedback", message: "月次コメントを保存しました。" };
    } catch {
      return fail(500, {
        scope: "feedback",
        message:
          "コメントを保存できませんでした。時間をおいて再度お試しください。",
        feedbackInput,
      });
    }
  },
  markPaid: async (event) => {
    requireAdmin(event);
    const formData = await event.request.formData();
    const paidOn = String(formData.get("paidOn") ?? "");
    const paymentComment = String(formData.get("paymentComment") ?? "");
    const result = await markSettlementPaid(
      event.params.month,
      event.params.assignee,
      paidOn,
      paymentComment,
    );
    if (!result.ok)
      return fail(400, {
        scope: "payment",
        message: result.message,
        paymentInput: { paidOn, paymentComment },
      });
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
