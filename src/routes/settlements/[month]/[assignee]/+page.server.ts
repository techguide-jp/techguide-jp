import { requireSelfOrAdmin } from "$lib/server/auth/guards";
import { loadSettlementAssignee } from "$lib/server/settlements/settlementService";

export const load = async (event) => {
  requireSelfOrAdmin(event, event.params.assignee);
  return {
    month: event.params.month,
    assignee: event.params.assignee,
    ...(await loadSettlementAssignee(event.params.month, event.params.assignee))
  };
};
