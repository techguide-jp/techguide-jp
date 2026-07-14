import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "$lib/server/env";
import { getPayerInformation } from "$lib/server/notices/noticeService";
import { decryptPayload } from "$lib/server/payoutAccounts/payoutAccountCrypto";
import { getPayoutAccountRow } from "$lib/server/payoutAccounts/payoutAccountRepository";

vi.mock("$lib/server/env", () => ({
  env: {
    adminGithubLogins: new Set(["first-admin", "second-admin"]),
    appOrigin: undefined,
  },
}));

vi.mock("$lib/server/payoutAccounts/payoutAccountCrypto", () => ({
  decryptPayload: vi.fn(),
}));

vi.mock("$lib/server/payoutAccounts/payoutAccountRepository", () => ({
  getPayoutAccountRow: vi.fn(),
}));

const payoutPayload = {
  recipientName: "株式会社テックガイド",
  postalCode: "100-0001",
  address: "東京都千代田区千代田1-1",
  bankName: "テスト銀行",
  branchName: "本店",
  accountType: "ordinary" as const,
  accountNumber: "1234567",
  accountHolderName: "テックガイド",
  note: "非表示情報",
};

beforeEach(() => {
  vi.clearAllMocks();
  env.adminGithubLogins.clear();
  env.adminGithubLogins.add("first-admin");
  env.adminGithubLogins.add("second-admin");
});

describe("getPayerInformation", () => {
  it("先頭の管理者の振込先から宛先3項目だけを返す", async () => {
    vi.mocked(getPayoutAccountRow).mockResolvedValue({
      encryptedPayload: "encrypted-payout-account",
    } as Awaited<ReturnType<typeof getPayoutAccountRow>>);
    vi.mocked(decryptPayload).mockReturnValue(payoutPayload);

    const result = await getPayerInformation();

    expect(getPayoutAccountRow).toHaveBeenCalledWith("first-admin");
    expect(result).toEqual({
      ok: true,
      recipient: {
        recipientName: "株式会社テックガイド",
        postalCode: "100-0001",
        address: "東京都千代田区千代田1-1",
      },
    });
  });

  it("管理者が設定されていない場合は取得理由を返す", async () => {
    env.adminGithubLogins.clear();

    await expect(getPayerInformation()).resolves.toEqual({
      ok: false,
      reason: "admin_not_configured",
    });
    expect(getPayoutAccountRow).not.toHaveBeenCalled();
  });

  it("先頭の管理者の振込先が未登録の場合は取得理由を返す", async () => {
    vi.mocked(getPayoutAccountRow).mockResolvedValue(null);

    await expect(getPayerInformation()).resolves.toEqual({
      ok: false,
      reason: "payout_account_missing",
    });
  });

  it("先頭の管理者の振込先を復号できない場合は取得理由を返す", async () => {
    vi.mocked(getPayoutAccountRow).mockResolvedValue({
      encryptedPayload: "invalid-payload",
    } as Awaited<ReturnType<typeof getPayoutAccountRow>>);
    vi.mocked(decryptPayload).mockImplementation(() => {
      throw new Error("decrypt failed");
    });

    await expect(getPayerInformation()).resolves.toEqual({
      ok: false,
      reason: "payout_decrypt_failed",
    });
  });
});
