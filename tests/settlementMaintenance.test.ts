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
import { getMonthlyWorkerLetter } from "$lib/server/notifications/monthlyLetterRepository";
import { listAllWorkerProfiles } from "$lib/server/workers/workerProfileRepository";

vi.mock("$lib/server/notifications/monthlyLetterRepository", () => ({
  getMonthlyWorkerLetter: vi.fn(),
}));
vi.mock("$lib/server/workers/workerProfileRepository", () => ({
  listAllWorkerProfiles: vi.fn(),
}));
vi.mock("$lib/server/env", () => ({
  env: { adminGithubLogins: new Set(["admin"]) },
}));
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
    vi.resetAllMocks();
    vi.mocked(fetchProjectIssuesForPage).mockResolvedValue({
      health: null,
      issues: [],
      projectFetchError: null,
    } as never);
    vi.mocked(reconcileCompletionReports).mockResolvedValue({
      base: 1,
      supplemental: 2,
    });
    vi.mocked(getMonthlyWorkerLetter).mockResolvedValue(null);
    vi.mocked(listAllWorkerProfiles).mockResolvedValue([
      { login: "worker", displayName: "作業者" },
    ] as never);
    vi.mocked(prepareSettlementNotificationSafely).mockResolvedValue({
      mode: "preview",
      entries: [],
    });
    vi.mocked(insertNotificationEventMarker).mockResolvedValue(true);
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
        adminReminderCreated: false,
      });
      expect(fetchProjectIssuesForPage).not.toHaveBeenCalled();
      expect(reconcileCompletionReports).not.toHaveBeenCalled();
      expect(loadSettlementMonth).not.toHaveBeenCalled();
      expect(prepareSettlementNotificationSafely).not.toHaveBeenCalled();
      expect(dispatchPreparedNotification).not.toHaveBeenCalled();
    },
  );

  it.each(["2026-08-31T15:00:00Z", "2026-09-01T00:00:00Z"])(
    "日本時間の1日は全登録者に申請状況を出し分けて配信する: %s",
    async (now) => {
      vi.mocked(loadSettlementMonth).mockResolvedValue({
        summaries: [summary("not-submitted"), summary("submitted")],
        submissions: [{ assigneeLogin: "Submitted" }],
        snapshots: [{ assigneeLogin: "approved" }],
        projectFetchError: null,
      } as never);
      vi.mocked(listAllWorkerProfiles).mockResolvedValue(
        ["not-submitted", "submitted", "approved", "no-settlement"].map(
          (login) => ({
            login,
            displayName: login,
          }),
        ) as never,
      );
      vi.mocked(getMonthlyWorkerLetter).mockResolvedValue({
        body: "今月のお手紙",
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
      expect(getMonthlyWorkerLetter).toHaveBeenCalledWith("2026-09");
      expect(
        vi
          .mocked(prepareSettlementNotificationSafely)
          .mock.calls.map(([input]) => [
            input.assigneeLogin,
            input.monthlySubmissionStatus,
          ]),
      ).toEqual([
        ["not-submitted", "required"],
        ["submitted", "submitted"],
        ["approved", "approved"],
        ["no-settlement", "not_required"],
      ]);
      expect(prepareSettlementNotificationSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "monthly_submission_reminder",
          month: "2026-08",
          monthlyLetterBody: "今月のお手紙",
        }),
      );
      expect(insertPreparedNotification).toHaveBeenCalledTimes(4);
      expect(dispatchPreparedNotification).toHaveBeenCalledTimes(4);
      expect(insertNotificationEventMarker).not.toHaveBeenCalled();
      expect(result.remindersCreated).toBe(4);
    },
  );

  it("同じ通知キーが保存済みなら再送しない", async () => {
    vi.mocked(loadSettlementMonth).mockResolvedValue({
      summaries: [summary("worker")],
      submissions: [],
      snapshots: [],
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

  it.each([
    ["2026-02-25", "2026-03"],
    ["2028-02-26", "2028-03"],
    ["2026-11-27", "2026-12"],
    ["2026-12-28", "2027-01"],
  ])(
    "月末3日前の %s に未記入のお手紙を管理者へ通知する",
    async (day, sendMonth) => {
      expect(
        await runSettlementMaintenance(new Date(`${day}T00:00:00Z`)),
      ).toMatchObject({
        adminReminderCreated: true,
        remindersCreated: 0,
      });
      expect(getMonthlyWorkerLetter).toHaveBeenCalledWith(sendMonth);
      expect(prepareSettlementNotificationSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "monthly_letter_missing",
          month: sendMonth,
        }),
      );
      expect(dispatchPreparedNotification).toHaveBeenCalledOnce();
      expect(fetchProjectIssuesForPage).not.toHaveBeenCalled();
    },
  );

  it("本文が保存済みなら月末3日前にも管理者へ通知しない", async () => {
    vi.mocked(getMonthlyWorkerLetter).mockResolvedValue({
      body: "翌月分",
    } as never);
    expect(
      await runSettlementMaintenance(new Date("2026-11-27T00:00:00Z")),
    ).toMatchObject({
      adminReminderCreated: false,
    });
    expect(prepareSettlementNotificationSafely).not.toHaveBeenCalled();
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
