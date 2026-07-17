import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptNoticeRecipient,
  encryptNoticeRecipient,
} from "$lib/server/notices/noticeCrypto";

beforeEach(() => {
  process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY =
    "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
});

describe("noticeCrypto", () => {
  it("宛名・郵便番号・住所のみを暗号化し、復号で元へ戻る", () => {
    const recipient = {
      recipientName: "山田 太郎",
      postalCode: "150-0001",
      address: "東京都渋谷区神南1-2-3",
    };

    const encrypted = encryptNoticeRecipient(recipient);
    expect(encrypted).not.toContain(recipient.address);
    expect(decryptNoticeRecipient(encrypted)).toEqual(recipient);
  });

  it("口座情報は暗号化対象に含めない", () => {
    const encrypted = encryptNoticeRecipient({
      recipientName: "山田 太郎",
      postalCode: "150-0001",
      // @ts-expect-error 口座番号は NoticeRecipient に含まれない
      accountNumber: "0123456",
      address: "東京都渋谷区神南1-2-3",
    });

    const decrypted = decryptNoticeRecipient(encrypted);
    expect(Object.keys(decrypted).sort()).toEqual([
      "address",
      "postalCode",
      "recipientName",
    ]);
    expect(JSON.stringify(decrypted)).not.toContain("0123456");
  });

  it("不正な暗号文は安全に失敗する", () => {
    expect(() => decryptNoticeRecipient('{"v":1,"data":"AAAA"}')).toThrow();
  });
});
