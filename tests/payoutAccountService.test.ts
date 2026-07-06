import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerPayoutAccount } from "$lib/server/db/schema";
import { getWorkerProfile } from "$lib/server/workers/workerProfileRepository";
import {
  getPayoutAccountRow,
  upsertPayoutAccount,
} from "$lib/server/payoutAccounts/payoutAccountRepository";
import { encryptPayload } from "$lib/server/payoutAccounts/payoutAccountCrypto";
import {
  loadPayoutAccountForViewer,
  updateOwnPayoutAccount,
} from "$lib/server/payoutAccounts/payoutAccountService";

vi.mock("$lib/server/workers/workerProfileRepository", () => ({
  getWorkerProfile: vi.fn(),
}));

vi.mock("$lib/server/payoutAccounts/payoutAccountRepository", () => ({
  getPayoutAccountRow: vi.fn(),
  listPayoutAccountStatusRows: vi.fn(),
  upsertPayoutAccount: vi.fn(),
}));

const payoutRow = (
  overrides: Partial<WorkerPayoutAccount> = {},
): WorkerPayoutAccount => ({
  login: "tashua314",
  encryptedPayload: '{"v":1,"data":"placeholder"}',
  encryptionKeyVersion: 1,
  updatedBy: "tashua314",
  version: 1,
  createdAt: new Date("2026-06-18T00:00:00Z"),
  updatedAt: new Date("2026-06-18T00:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY =
    "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
  vi.mocked(getWorkerProfile).mockResolvedValue({
    login: "tashua314",
    displayName: "たしゅあ",
    skills: [],
    specialtyNote: "",
    availabilityNote: "",
    selfAssignmentNote: "",
    adminNote: "",
    adminNoteUpdatedBy: null,
    adminNoteUpdatedAt: null,
    createdAt: new Date("2026-06-18T00:00:00Z"),
    updatedAt: new Date("2026-06-18T00:00:00Z"),
  });
  vi.mocked(getPayoutAccountRow).mockResolvedValue(null);
});

const payoutFormData = (overrides: Record<string, string> = {}): FormData => {
  const data = new FormData();
  data.set("recipientName", "山田 太郎");
  data.set("postalCode", "1500001");
  data.set("address", "東京都渋谷区神南1-2-3");
  data.set("bankName", "テスト銀行");
  data.set("branchName", "本店");
  data.set("accountType", "ordinary");
  data.set("accountNumber", "0123456");
  data.set("accountHolderName", "ヤマダ タロウ");
  data.set("version", "0");
  for (const [key, value] of Object.entries(overrides)) {
    data.set(key, value);
  }
  return data;
};

describe("payoutAccountService", () => {
  it("本人以外の振込先更新を拒否する", async () => {
    const result = await updateOwnPayoutAccount(
      payoutFormData(),
      "worker-user",
      "tashua314",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.messages[0]).toContain("本人以外");
    expect(upsertPayoutAccount).not.toHaveBeenCalled();
  });

  it("その他の利用者には振込先を返さない", async () => {
    const result = await loadPayoutAccountForViewer("tashua314", {
      login: "worker-user",
      isAdmin: false,
    });

    expect(result).toBeNull();
  });

  it("復号に失敗した登録済み振込先を編集不能なエラー状態で返す", async () => {
    vi.mocked(getPayoutAccountRow).mockResolvedValue(
      payoutRow({ encryptedPayload: '{"v":1,"data":"AAAA"}', version: 3 }),
    );

    const result = await loadPayoutAccountForViewer("tashua314", {
      login: "tashua314",
      isAdmin: false,
    });

    expect(result).toMatchObject({
      registered: true,
      loadError: true,
      version: 3,
    });
  });

  it("不正な口座番号を拒否する", async () => {
    const result = await updateOwnPayoutAccount(
      payoutFormData({ accountNumber: "12345" }),
      "tashua314",
      "tashua314",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.messages[0]).toContain("口座番号");
    expect(upsertPayoutAccount).not.toHaveBeenCalled();
  });

  it("不正な郵便番号を拒否する", async () => {
    const result = await updateOwnPayoutAccount(
      payoutFormData({ postalCode: "15000" }),
      "tashua314",
      "tashua314",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.messages[0]).toContain("郵便番号");
    expect(upsertPayoutAccount).not.toHaveBeenCalled();
  });

  it("複数の入力エラーを一括で返す", async () => {
    const result = await updateOwnPayoutAccount(
      payoutFormData({
        recipientName: "",
        postalCode: "15000",
        accountNumber: "12345",
      }),
      "tashua314",
      "tashua314",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.messages).toEqual([
      "宛名（名前・屋号・会社名）を確認してください。",
      "郵便番号は7桁の数字で入力してください。",
      "口座番号は7桁の数字で入力してください。",
    ]);
    expect(upsertPayoutAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["recipientName", "ア".repeat(101)],
    ["address", "ア".repeat(501)],
    ["bankName", "ア".repeat(101)],
    ["branchName", "ア".repeat(101)],
    ["accountHolderName", "ア".repeat(101)],
    ["note", "ア".repeat(2001)],
  ])("上限を超えた%sを切り捨てず拒否する", async (field, value) => {
    const result = await updateOwnPayoutAccount(
      payoutFormData({ [field]: value }),
      "tashua314",
      "tashua314",
    );

    expect(result.ok).toBe(false);
    expect(upsertPayoutAccount).not.toHaveBeenCalled();
  });

  it("本人の振込先更新を保存する", async () => {
    vi.mocked(upsertPayoutAccount).mockResolvedValue({
      ok: true,
      row: payoutRow({
        encryptedPayload: encryptFixture(),
      }),
    });

    const result = await updateOwnPayoutAccount(
      payoutFormData({ note: "メモ" }),
      "tashua314",
      "tashua314",
    );

    expect(result.ok).toBe(true);
    expect(upsertPayoutAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        login: "tashua314",
        updatedBy: "tashua314",
        expectedVersion: 0,
      }),
    );
  });
});

const encryptFixture = (): string =>
  encryptPayload({
    recipientName: "山田 太郎",
    postalCode: "150-0001",
    address: "東京都渋谷区神南1-2-3",
    bankName: "テスト銀行",
    branchName: "本店",
    accountType: "ordinary",
    accountNumber: "0123456",
    accountHolderName: "ヤマダ タロウ",
    note: "メモ",
  });
