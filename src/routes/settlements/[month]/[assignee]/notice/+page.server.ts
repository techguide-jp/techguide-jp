import { fail } from "@sveltejs/kit";
import { requireAdmin, requireSelfOrAdmin } from "$lib/server/auth/guards";
import {
  getNoticeForViewer,
  getPayerInformation,
} from "$lib/server/notices/noticeService";
import { getPayoutAccountStatus } from "$lib/server/payoutAccounts/payoutAccountService";
import { recreateSettlementNotice } from "$lib/server/settlements/settlementService";
import { getSnapshot } from "$lib/server/settlements/snapshotRepository";

export const load = async (event) => {
  requireSelfOrAdmin(event, event.params.assignee);
  const { month, assignee } = event.params;
  const [notice, payerInformation, snapshot, payoutStatus] = await Promise.all([
    getNoticeForViewer(month, assignee, event.locals.user),
    getPayerInformation(),
    getSnapshot(month, assignee),
    getPayoutAccountStatus(assignee),
  ]);

  return {
    month,
    assignee,
    notice,
    payerInformation:
      payerInformation.ok && notice ? payerInformation.recipient : null,
    approved: Boolean(snapshot),
    payoutRegistered: payoutStatus.registered,
  };
};

export const actions = {
  recreate: async (event) => {
    const user = requireAdmin(event);
    const result = await recreateSettlementNotice(
      event.params.month,
      event.params.assignee,
      user.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "支払い通知書を再作成しました。" };
  },
};
