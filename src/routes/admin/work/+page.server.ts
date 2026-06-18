import { requireAdmin } from "$lib/server/auth/guards";
import { loadAdminWorkDashboard } from "$lib/server/admin/adminWorkService";

export const load = async (event) => {
  requireAdmin(event);
  return loadAdminWorkDashboard();
};
