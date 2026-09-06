import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadMonthlyFeedbackForViewer,
  saveOwnMonthlyFeedback,
} from "$lib/server/settlements/monthlyFeedbackService";
import {
  getMonthlyFeedback,
  updateMonthlyFeedback,
} from "$lib/server/settlements/monthlyFeedbackRepository";
vi.mock("$lib/server/settlements/monthlyFeedbackRepository", () => ({
  getMonthlyFeedback: vi.fn(),
  updateMonthlyFeedback: vi.fn(),
}));
const input = {
  operatorComment: "質問",
  privateReflection: "本人の振り返り",
  version: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateMonthlyFeedback).mockResolvedValue(true);
});
describe("月次コメントの境界", () => {
  it("管理者の他人閲覧では私的本文をSELECTしない", async () => {
    await loadMonthlyFeedbackForViewer("2026-08", "worker", {
      login: "admin",
      isAdmin: true,
    });
    expect(getMonthlyFeedback).toHaveBeenCalledWith("2026-08", "worker", false);
    await loadMonthlyFeedbackForViewer("2026-08", "admin", {
      login: "admin",
      isAdmin: true,
    });
    expect(getMonthlyFeedback).toHaveBeenLastCalledWith(
      "2026-08",
      "admin",
      true,
    );
  });
  it("他人の閲覧・本人以外の更新を保存前に拒否する", async () => {
    expect(
      await loadMonthlyFeedbackForViewer("2026-08", "worker", {
        login: "other",
        isAdmin: false,
      }),
    ).toBeNull();
    expect(getMonthlyFeedback).not.toHaveBeenCalled();
    expect(
      (await saveOwnMonthlyFeedback("2026-08", "worker", "admin", input)).ok,
    ).toBe(false);
    expect(updateMonthlyFeedback).not.toHaveBeenCalled();
  });
  it("2,000文字を許容し、上限超過と不正月を拒否する", async () => {
    expect(
      (
        await saveOwnMonthlyFeedback("2026-08", "worker", "worker", {
          ...input,
          operatorComment: "あ".repeat(2000),
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await saveOwnMonthlyFeedback("2026-08", "worker", "worker", {
          ...input,
          privateReflection: "あ".repeat(2001),
        })
      ).ok,
    ).toBe(false);
    expect(
      (await saveOwnMonthlyFeedback("2026-13", "worker", "worker", input)).ok,
    ).toBe(false);
    expect(updateMonthlyFeedback).toHaveBeenCalledOnce();
  });
  it("承認・更新競合を成功に置き換えない", async () => {
    vi.mocked(updateMonthlyFeedback).mockResolvedValue(false);
    expect(
      (await saveOwnMonthlyFeedback("2026-08", "worker", "worker", input)).ok,
    ).toBe(false);
  });
});
