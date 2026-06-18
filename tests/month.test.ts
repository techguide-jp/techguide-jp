import { describe, expect, it } from "vitest";
import { addMonths, currentJstMonth, formatMonthLabel, isMonthString } from "../src/lib/month";
import { jstMonthRangeUtc, parseJstDatetimeLocal } from "../src/lib/server/time";

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

  it("datetime-localをJSTとしてDateに変換する", () => {
    expect(parseJstDatetimeLocal("2026-06-18T09:00")?.toISOString()).toBe("2026-06-18T00:00:00.000Z");
    expect(parseJstDatetimeLocal("2026-02-31T09:00")).toBeNull();
  });

  it("JST月のUTC範囲を返す", () => {
    const range = jstMonthRangeUtc("2026-06");

    expect(range.start.toISOString()).toBe("2026-05-31T15:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-30T15:00:00.000Z");
  });
});
