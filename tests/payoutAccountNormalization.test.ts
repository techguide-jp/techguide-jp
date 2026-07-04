import { describe, expect, it } from "vitest";
import {
  normalizeAccountHolderName,
  normalizeAccountNumber,
} from "$lib/server/payoutAccounts/payoutAccountNormalization";

describe("payoutAccountNormalization", () => {
  it("口座番号の全角数字を半角化し先頭ゼロを維持する", () => {
    expect(normalizeAccountNumber("０１２３４５６")).toBe("0123456");
  });

  it("口座名義を正規化する", () => {
    expect(normalizeAccountHolderName("  ﾔﾏﾀﾞ ﾀﾛｳ  ")).toBe("ヤマダ タロウ");
  });
});
