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
    "ZGV2ZWxvcG1lbnQtcGF5b3V0LWFjY291bnQta2V5LTMyYiE=";
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

describe("payoutAccountService", () => {
  it("本人以外の振込先更新を拒否する", async () => {
    const data = new FormData();
    data.set("bankName", "テスト銀行");
    data.set("branchName", "本店");
    data.set("accountType", "ordinary");
    data.set("accountNumber", "0123456");
    data.set("accountHolderName", "ヤマダ タロウ");
    data.set("version", "0");

    const result = await updateOwnPayoutAccount(
      data,
      "worker-user",
      "tashua314",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("本人以外");
    expect(upsertPayoutAccount).not.toHaveBeenCalled();
  });

  it("その他の利用者には振込先を返さない", async () => {
    const result = await loadPayoutAccountForViewer("tashua314", {
      login: "worker-user",
      isAdmin: false,
    });

    expect(result).toBeNull();
  });

  it("不正な口座番号を拒否する", async () => {
    const data = new FormData();
    data.set("bankName", "テスト銀行");
    data.set("branchName", "本店");
    data.set("accountType", "ordinary");
    data.set("accountNumber", "12345");
    data.set("accountHolderName", "ヤマダ タロウ");
    data.set("version", "0");

    const result = await updateOwnPayoutAccount(data, "tashua314", "tashua314");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("口座番号");
    expect(upsertPayoutAccount).not.toHaveBeenCalled();
  });

  it("本人の振込先更新を保存する", async () => {
    vi.mocked(upsertPayoutAccount).mockResolvedValue({
      ok: true,
      row: payoutRow({
        encryptedPayload: encryptFixture(),
      }),
    });

    const data = new FormData();
    data.set("bankName", "テスト銀行");
    data.set("branchName", "本店");
    data.set("accountType", "ordinary");
    data.set("accountNumber", "0123456");
    data.set("accountHolderName", "ヤマダ タロウ");
    data.set("note", "メモ");
    data.set("version", "0");

    const result = await updateOwnPayoutAccount(data, "tashua314", "tashua314");

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
    bankName: "テスト銀行",
    branchName: "本店",
    accountType: "ordinary",
    accountNumber: "0123456",
    accountHolderName: "ヤマダ タロウ",
    note: "メモ",
  });
