import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "$lib/server/env";
import {
  getNoticeForViewer,
  getPayerInformation,
  prepareNoticeWriteInput,
} from "$lib/server/notices/noticeService";
import {
  decryptNoticeRecipient,
  encryptNoticeRecipient,
} from "$lib/server/notices/noticeCrypto";
import { getLatestNotice } from "$lib/server/notices/noticeRepository";
import { decryptPayload } from "$lib/server/payoutAccounts/payoutAccountCrypto";
import { getPayoutAccountRow } from "$lib/server/payoutAccounts/payoutAccountRepository";
import { getWorkerProfile } from "$lib/server/workers/workerProfileRepository";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

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

vi.mock("$lib/server/notices/noticeCrypto", () => ({
  encryptNoticeRecipient: vi.fn(),
  decryptNoticeRecipient: vi.fn(),
}));

vi.mock("$lib/server/notices/noticeRepository", () => ({
  getLatestNotice: vi.fn(),
}));

vi.mock("$lib/server/workers/workerProfileRepository", () => ({
  getWorkerProfile: vi.fn(),
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
  vi.mocked(getWorkerProfile).mockResolvedValue(null);
  vi.mocked(encryptNoticeRecipient).mockImplementation(
    (recipient) => `encrypted:${recipient.recipientName}`,
  );
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

describe("prepareNoticeWriteInput", () => {
  it("支払先と支払い者の宛先をそれぞれ暗号化して凍結する", async () => {
    vi.mocked(getPayoutAccountRow).mockImplementation(
      async (login) =>
        ({
          encryptedPayload:
            login === "worker-user" ? "worker-payload" : "payer-payload",
        }) as Awaited<ReturnType<typeof getPayoutAccountRow>>,
    );
    vi.mocked(decryptPayload).mockImplementation((encryptedPayload) => ({
      ...payoutPayload,
      recipientName:
        encryptedPayload === "worker-payload"
          ? "作業者 山田"
          : "株式会社テックガイド",
    }));

    const summary: SettlementSummary = {
      month: "2026-06",
      assigneeLogin: "worker-user",
      fixedRewardYen: 0,
      timedRewardYen: 0,
      taxExcludedYen: 0,
      taxYen: 0,
      taxIncludedYen: 0,
      lines: [],
      pendingRequests: [],
      unsettledProjectIssues: [],
      unsettledIssueSessions: [],
      approvalRequired: true,
      blockingReasons: [],
    };

    const result = await prepareNoticeWriteInput({
      month: "2026-06",
      assigneeLogin: "worker-user",
      summary,
      scheduledDate: "2026-07-14",
      approvedBy: "first-admin",
      approvedAt: "2026-07-11T00:00:00Z",
      issuedOn: "2026-07-11",
      createdBy: "first-admin",
    });

    expect(result).toMatchObject({
      ok: true,
      notice: {
        recipientEncryptedPayload: "encrypted:作業者 山田",
        payerEncryptedPayload: "encrypted:株式会社テックガイド",
      },
    });
    expect(encryptNoticeRecipient).toHaveBeenCalledWith({
      recipientName: "株式会社テックガイド",
      postalCode: "100-0001",
      address: "東京都千代田区千代田1-1",
    });
  });
});

describe("getNoticeForViewer", () => {
  it("表示時の現在値ではなく通知書に凍結した支払い者情報を返す", async () => {
    vi.mocked(getLatestNotice).mockResolvedValue({
      id: 1,
      month: "2026-06",
      assigneeLogin: "worker-user",
      document: {
        schemaVersion: 1,
        totals: {
          fixedRewardYen: 0,
          timedRewardYen: 0,
          taxExcludedYen: 0,
          taxYen: 0,
          taxIncludedYen: 0,
        },
        lines: [],
        workLogs: [],
      },
      workerDisplayName: "作業者 山田",
      recipientEncryptedPayload: "frozen-worker",
      payerEncryptedPayload: "frozen-payer",
      encryptionKeyVersion: 1,
      scheduledDate: "2026-07-14",
      approvedBy: "first-admin",
      approvedAt: new Date("2026-07-11T00:00:00Z"),
      issuedOn: "2026-07-11",
      createdBy: "first-admin",
      createdAt: new Date("2026-07-11T00:00:00Z"),
    });
    vi.mocked(decryptNoticeRecipient).mockImplementation((payload) =>
      payload === "frozen-payer"
        ? {
            recipientName: "承認時点の支払い者",
            postalCode: "100-0001",
            address: "承認時点の住所",
          }
        : {
            recipientName: "作業者 山田",
            postalCode: "150-0001",
            address: "作業者の住所",
          },
    );

    const notice = await getNoticeForViewer("2026-06", "worker-user", {
      login: "worker-user",
      isAdmin: false,
    });

    expect(notice?.payer).toEqual({
      recipientName: "承認時点の支払い者",
      postalCode: "100-0001",
      address: "承認時点の住所",
    });
    expect(getPayoutAccountRow).not.toHaveBeenCalled();
  });
});
