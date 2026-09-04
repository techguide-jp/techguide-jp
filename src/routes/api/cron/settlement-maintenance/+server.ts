import { json } from "@sveltejs/kit";
import { env } from "$lib/server/env";
import { runSettlementMaintenance } from "$lib/server/settlements/settlementMaintenanceService";

export const GET = async ({ request }) => {
  if (!env.cronSecret) {
    return json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!env.settlementRuleV2Enabled) {
    return json({ ok: true, disabled: true });
  }

  try {
    const result = await runSettlementMaintenance();
    return json({ ok: true, ...result });
  } catch (error) {
    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Settlement maintenance failed",
      },
      { status: 503 },
    );
  }
};
