import { requireAdmin } from "$lib/server/auth/guards";
import { listAdminWorkerProfiles } from "$lib/server/workers/workerProfileService";

export const load = async (event) => {
  requireAdmin(event);

  return {
    workers: await listAdminWorkerProfiles(),
  };
};
