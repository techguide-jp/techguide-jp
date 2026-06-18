import { describe, expect, it } from "vitest";
import { addMonths, currentJstMonth, formatMonthLabel, isMonthString } from "../src/lib/month";

describe("month utilities", () => {
  it("月文字列を検証する", () => {
    expect(isMonthString("2026-06")).toBe(true);
    expect(isMonthString("2026-13")).toBe(false);
    expect(isMonthString("2026-6")).toBe(false);
  });

  it("年またぎで前月と翌月を計算する", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });

  it("JSTの現在月を返す", () => {
    expect(currentJstMonth(new Date("2026-05-31T15:00:00Z"))).toBe("2026-06");
  });

  it("表示用の月ラベルを返す", () => {
    expect(formatMonthLabel("2026-06")).toBe("2026年6月");
  });
});
