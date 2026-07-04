import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptPayload,
  encryptPayload,
} from "$lib/server/payoutAccounts/payoutAccountCrypto";
import type { WorkerPayoutAccountPayload } from "$lib/server/payoutAccounts/payoutAccountTypes";

const payload = (): WorkerPayoutAccountPayload => ({
  bankName: "テスト銀行",
  branchName: "本店",
  accountType: "ordinary",
  accountNumber: "0123456",
  accountHolderName: "ヤマダ タロウ",
  note: "テストメモ",
});

beforeEach(() => {
  process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY =
    "ZGV2ZWxvcG1lbnQtcGF5b3V0LWFjY291bnQta2V5LTMyYiE=";
});

describe("payoutAccountCrypto", () => {
  it("暗号化と復号で元の値へ戻る", () => {
    const original = payload();
    const encrypted = encryptPayload(original);
    expect(encrypted).not.toContain(original.accountNumber);
    expect(decryptPayload(encrypted)).toEqual(original);
  });

  it("不正な暗号文は安全に失敗する", () => {
    expect(() => decryptPayload('{"v":1,"data":"AAAA"}')).toThrow();
  });
});
