import { describe, expect, it, vi } from "vitest";
import {
  isLocalImpersonationActive,
  runWithLocalImpersonation,
} from "$lib/server/auth/localImpersonationContext";
import { setProjectItemStatus } from "$lib/server/github/projectClient";
import { retryProjectStatusSync } from "$lib/server/github/statusSyncService";
import { getPendingProjectStatusSync } from "$lib/server/github/statusSyncRepository";

vi.mock("$lib/server/env", () => ({ env: { e2eTestMode: true } }));
vi.mock("$lib/server/github/statusSyncRepository", () => ({
  getPendingProjectStatusSync: vi.fn(),
  markProjectStatusSyncAttemptFailed: vi.fn(),
  upsertPendingProjectStatusSync: vi.fn(),
  resolveProjectStatusSync: vi.fn(),
}));

const context = { adminLogin: "admin", targetLogin: "worker" };

describe("擬似ログイン中の外部更新制限", () => {
  it("GitHub更新はテストモードより先に拒否し、別リクエストは影響を受けない", async () => {
    const results = await Promise.all([
      runWithLocalImpersonation(context, async () => {
        await Promise.resolve();
        expect(isLocalImpersonationActive()).toBe(true);
        await expect(
          setProjectItemStatus("item", "In Progress"),
        ).rejects.toThrow("擬似ログイン中");
        return isLocalImpersonationActive();
      }),
      runWithLocalImpersonation(null, async () => {
        await Promise.resolve();
        await expect(
          setProjectItemStatus("item", "In Progress"),
        ).resolves.toBeUndefined();
        return isLocalImpersonationActive();
      }),
    ]);
    expect(results).toEqual([true, false]);
    expect(isLocalImpersonationActive()).toBe(false);
  });

  it("再同期を停止し、保留中の同期情報を変更しない", async () => {
    const result = await runWithLocalImpersonation(context, () =>
      retryProjectStatusSync("sync", "worker", false),
    );
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("擬似ログイン中"),
    });
    expect(getPendingProjectStatusSync).not.toHaveBeenCalled();
  });
});
