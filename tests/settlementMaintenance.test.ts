import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import { reconcileCompletionReports } from "$lib/server/completions/completionService";
import { loadSettlementMonth } from "$lib/server/settlements/settlementService";
import {
  insertNotificationEventMarker,
  insertPreparedNotification,
} from "$lib/server/notifications/notificationRepository";
import {
  dispatchPreparedNotification,
  prepareSettlementNotificationSafely,
} from "$lib/server/notifications/notificationService";
import { runSettlementMaintenance } from "$lib/server/settlements/settlementMaintenanceService";

vi.mock("$lib/server/github/projectClient", () => ({
  fetchProjectIssuesForPage: vi.fn(),
}));
vi.mock("$lib/server/completions/completionService", () => ({
  reconcileCompletionReports: vi.fn(),
}));
vi.mock("$lib/server/settlements/settlementService", () => ({
  loadSettlementMonth: vi.fn(),
}));
vi.mock("$lib/server/notifications/notificationRepository", () => ({
  insertNotificationEventMarker: vi.fn(),
  insertPreparedNotification: vi.fn(),
}));
vi.mock("$lib/server/notifications/notificationService", () => ({
  dispatchPreparedNotification: vi.fn(),
  prepareSettlementNotificationSafely: vi.fn(),
}));

const summary = (assigneeLogin: string) => ({
  month: "2026-08",
  assigneeLogin,
  fixedRewardYen: 10_000,
  timedRewardYen: 0,
  taxExcludedYen: 10_000,
  taxYen: 1_000,
  taxIncludedYen: 11_000,
  lines: [],
  pendingRequests: [],
  unsettledProjectIssues: [],
  unsettledIssueSessions: [],
  approvalRequired: true,
  blockingReasons: [],
});

describe("runSettlementMaintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProjectIssuesForPage).mockResolvedValue({
      health: null,
      issues: [],
      projectFetchError: null,
    } as never);
    vi.mocked(reconcileCompletionReports).mockResolvedValue({
      base: 1,
      supplemental: 2,
    });
  });

  it.each(["2026-08-31T14:59:59Z", "2026-09-01T15:00:00Z"])(
    "日本時間の毎月1日以外は更新・通知を行わない: %s",
    async (now) => {
      const result = await runSettlementMaintenance(new Date(now));

      expect(result).toEqual({
        reconciledBase: 0,
        reconciledSupplemental: 0,
        remindersCreated: 0,
        reminderMonth: null,
      });
      expect(fetchProjectIssuesForPage).not.toHaveBeenCalled();
      expect(reconcileCompletionReports).not.toHaveBeenCalled();
      expect(loadSettlementMonth).not.toHaveBeenCalled();
      expect(prepareSettlementNotificationSafely).not.toHaveBeenCalled();
      expect(dispatchPreparedNotification).not.toHaveBeenCalled();
    },
  );

  it.each(["2026-08-31T15:00:00Z", "2026-09-01T00:00:00Z"])(
    "日本時間の1日は完了状態を反映して前月の未申請者へ通知する: %s",
    async (now) => {
      vi.mocked(loadSettlementMonth).mockResolvedValue({
        summaries: [summary("not-submitted"), summary("submitted")],
        submissions: [{ assigneeLogin: "submitted" }],
        projectFetchError: null,
      } as never);
      const prepared = {
        mode: "resend" as const,
        write: { eventKey: "event-key" },
      };
      vi.mocked(prepareSettlementNotificationSafely).mockResolvedValue(
        prepared as never,
      );
      vi.mocked(insertPreparedNotification).mockResolvedValue(true);

      const result = await runSettlementMaintenance(new Date(now));

      expect(reconcileCompletionReports).toHaveBeenCalledOnce();
      expect(loadSettlementMonth).toHaveBeenCalledWith("2026-08");
      expect(prepareSettlementNotificationSafely).toHaveBeenCalledOnce();
      expect(prepareSettlementNotificationSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "monthly_submission_reminder",
          month: "2026-08",
          assigneeLogin: "not-submitted",
        }),
      );
      expect(insertPreparedNotification).toHaveBeenCalledOnce();
      expect(dispatchPreparedNotification).toHaveBeenCalledOnce();
      expect(insertNotificationEventMarker).not.toHaveBeenCalled();
      expect(result.remindersCreated).toBe(1);
    },
  );

  it("同じ通知キーが保存済みなら再送しない", async () => {
    vi.mocked(loadSettlementMonth).mockResolvedValue({
      summaries: [summary("worker")],
      submissions: [],
      projectFetchError: null,
    } as never);
    vi.mocked(prepareSettlementNotificationSafely).mockResolvedValue({
      mode: "resend",
      write: { eventKey: "existing-event" },
    } as never);
    vi.mocked(insertPreparedNotification).mockResolvedValue(false);

    const result = await runSettlementMaintenance(
      new Date("2026-09-01T00:00:00Z"),
    );

    expect(dispatchPreparedNotification).not.toHaveBeenCalled();
    expect(result.remindersCreated).toBe(0);
  });

  it("GitHub取得失敗時は対象化せずエラーにする", async () => {
    vi.mocked(fetchProjectIssuesForPage).mockResolvedValue({
      health: null,
      issues: [],
      projectFetchError: "GitHub API error",
    } as never);

    await expect(
      runSettlementMaintenance(new Date("2026-09-01T00:00:00Z")),
    ).rejects.toThrow("GitHub API error");
    expect(reconcileCompletionReports).not.toHaveBeenCalled();
  });
});
