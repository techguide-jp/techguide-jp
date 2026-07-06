import { fail } from "@sveltejs/kit";
import { requireSelfOrAdmin } from "$lib/server/auth/guards";
import { getPayoutAccountStatus } from "$lib/server/payoutAccounts/payoutAccountService";
import {
  loadSettlementAssignee,
  submitSettlementWork,
} from "$lib/server/settlements/settlementService";

export const load = async (event) => {
  requireSelfOrAdmin(event, event.params.assignee);
  const assignee = event.params.assignee;

  return {
    month: event.params.month,
    assignee,
    payoutAccountStatus: await getPayoutAccountStatus(assignee),
    ...(await loadSettlementAssignee(event.params.month, assignee)),
  };
};

export const actions = {
  submitWork: async (event) => {
    const user = requireSelfOrAdmin(event, event.params.assignee);
    const result = await submitSettlementWork(
      event.params.month,
      event.params.assignee,
      user.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: `${event.params.month} の稼働を確定して申請しました。` };
  },
};
