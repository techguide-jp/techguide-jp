import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/routes/api/cron/settlement-maintenance/+server";
import { runSettlementMaintenance } from "$lib/server/settlements/settlementMaintenanceService";

vi.mock("$lib/server/env", () => ({
  env: {
    cronSecret: "cron-secret",
    settlementRuleV2Enabled: true,
  },
}));
vi.mock("$lib/server/settlements/settlementMaintenanceService", () => ({
  runSettlementMaintenance: vi.fn(),
}));

const call = (authorization?: string) =>
  GET({
    request: new Request(
      "https://example.com/api/cron/settlement-maintenance",
      {
        headers: authorization ? { authorization } : {},
      },
    ),
  } as never);

describe("GET /api/cron/settlement-maintenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("不正な認証を401で拒否する", async () => {
    const response = await call("Bearer invalid");

    expect(response.status).toBe(401);
    expect(runSettlementMaintenance).not.toHaveBeenCalled();
  });

  it("正しいBearer認証でメンテナンスを実行する", async () => {
    vi.mocked(runSettlementMaintenance).mockResolvedValue({
      reconciledBase: 1,
      reconciledSupplemental: 2,
      remindersCreated: 3,
      reminderMonth: "2026-08",
    });

    const response = await call("Bearer cron-secret");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      reconciledBase: 1,
      reconciledSupplemental: 2,
      remindersCreated: 3,
      reminderMonth: "2026-08",
    });
  });
});
