import { fail } from "@sveltejs/kit";
import { requireAdmin, requireSelfOrAdmin } from "$lib/server/auth/guards";
import {
  getNoticeForViewer,
  getSupplementalNoticeForViewer,
} from "$lib/server/notices/noticeService";
import { getPayoutAccountStatus } from "$lib/server/payoutAccounts/payoutAccountService";
import { recreateSettlementNotice } from "$lib/server/settlements/settlementService";
import { getSnapshot } from "$lib/server/settlements/snapshotRepository";

export const load = async (event) => {
  requireSelfOrAdmin(event, event.params.assignee);
  const { month, assignee } = event.params;
  const supplementalPaymentId = event.url.searchParams.get("supplemental");
  const [notice, snapshot, payoutStatus] = await Promise.all([
    supplementalPaymentId
      ? getSupplementalNoticeForViewer(
          supplementalPaymentId,
          assignee,
          event.locals.user,
        )
      : getNoticeForViewer(month, assignee, event.locals.user),
    getSnapshot(month, assignee),
    getPayoutAccountStatus(assignee),
  ]);

  return {
    month,
    assignee,
    notice,
    approved: Boolean(snapshot),
    payoutRegistered: payoutStatus.registered,
    isSupplemental: Boolean(supplementalPaymentId),
  };
};

export const actions = {
  recreate: async (event) => {
    const user = requireAdmin(event);
    if (event.url.searchParams.has("supplemental")) {
      return fail(400, {
        message: "追加支払い通知書は予定日確定時の内容を保持します。",
      });
    }
    const result = await recreateSettlementNotice(
      event.params.month,
      event.params.assignee,
      user.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "支払い通知書を再作成しました。" };
  },
};
