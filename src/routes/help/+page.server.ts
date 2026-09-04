import { env } from "$lib/server/env";

export const load = () => ({
  settlementRuleV2Enabled: env.settlementRuleV2Enabled,
});
