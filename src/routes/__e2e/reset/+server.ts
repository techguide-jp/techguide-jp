import { error, json } from "@sveltejs/kit";
import {
  auditLogs,
  authSessions,
  githubProjectStatusSyncs,
  monthlySettlementSnapshots,
  monthlyWorkSubmissions,
  workLogChangeRequests,
  workerPayoutAccounts,
  workerProfiles,
  workSessions,
} from "$lib/server/db/schema";
import { db } from "$lib/server/db/client";
import { env } from "$lib/server/env";

export const POST = async () => {
  if (!env.e2eTestMode) {
    throw error(404, "Not found");
  }

  await db.delete(auditLogs);
  await db.delete(monthlySettlementSnapshots);
  await db.delete(monthlyWorkSubmissions);
  await db.delete(workLogChangeRequests);
  await db.delete(workSessions);
  await db.delete(githubProjectStatusSyncs);
  await db.delete(authSessions);
  await db.delete(workerPayoutAccounts);
  await db.delete(workerProfiles);

  return json({ ok: true });
};
