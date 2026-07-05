import { describe, expect, it } from "vitest";
import {
  normalizeAccountHolderName,
  normalizeAccountNumber,
  normalizeAddress,
  normalizePostalCode,
} from "$lib/server/payoutAccounts/payoutAccountNormalization";

describe("payoutAccountNormalization", () => {
  it("口座番号の全角数字を半角化し先頭ゼロを維持する", () => {
    expect(normalizeAccountNumber("０１２３４５６")).toBe("0123456");
  });

  it("口座名義を正規化する", () => {
    expect(normalizeAccountHolderName("  ﾔﾏﾀﾞ ﾀﾛｳ  ")).toBe("ヤマダ タロウ");
  });

  it("郵便番号を7桁に正規化する", () => {
    expect(normalizePostalCode("150-0001")).toBe("150-0001");
    expect(normalizePostalCode("１５００００１")).toBe("150-0001");
    expect(normalizePostalCode("150000")).toBe("");
  });

  it("住所の空行を除去する", () => {
    expect(normalizeAddress("  東京都渋谷区\n\n  1-2-3  ")).toBe(
      "東京都渋谷区\n1-2-3",
    );
  });
});
