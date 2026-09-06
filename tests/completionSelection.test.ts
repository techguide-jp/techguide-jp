import { describe, expect, it } from "vitest";
import { completionReport } from "./fixtures/completionReport";
import { selectCompletionReports } from "$lib/server/completions/completionSelection";
import { buildSettlementSummariesV2 } from "$lib/server/settlements/settlementCalculatorV2";
import type { ProjectIssue } from "$lib/server/github/projectTypes";

const first = completionReport();
const latest = completionReport({
  id: "20000000-0000-4000-8000-000000000002",
  assigneeLogin: "replacement",
  settlementMonth: "2026-09",
  reportedAt: new Date("2026-09-01T00:00:00Z"),
  createdAt: new Date("2026-09-01T00:00:00Z"),
});
const issue: ProjectIssue = {
  projectItemId: first.projectItemId,
  repository: first.repository,
  number: first.issueNumber,
  title: first.issueTitle,
  url: first.issueUrl,
  state: "CLOSED",
  status: "Done",
  createdAt: "2026-08-01T00:00:00Z",
  closedAt: "2026-09-10T00:00:00Z",
  assignees: ["replacement"],
  rewardMode: "ハイブリッド",
  fixedRewardYen: 50_000,
  hourlyRateYen: 6000,
  extraCapYen: 30_000,
};

describe("Issue全期間の有効な完了報告", () => {
  it.each([
    [first, latest],
    [latest, first],
  ])("配列順や担当者・月に関係なく最新を選ぶ", (...reports) => {
    expect(selectCompletionReports(reports).selected).toEqual([latest]);
  });
  it("取り下げ済みの新しい報告を選ばない", () => {
    expect(
      selectCompletionReports([first, { ...latest, invalidatedAt: new Date() }])
        .selected,
    ).toEqual([first]);
  });
  it("確認済みの旧担当者の報告は別担当者の再報告より優先する", () => {
    const confirmed = { ...first, eligibilityConfirmedAt: new Date() };
    expect(selectCompletionReports([latest, confirmed]).selected).toEqual([
      confirmed,
    ]);
  });
  it("報告日時が同じ場合も登録日時とIDで決定的に選ぶ", () => {
    const sameTime = {
      ...latest,
      reportedAt: first.reportedAt,
      createdAt: first.createdAt,
    };
    expect(selectCompletionReports([sameTime, first]).selected).toEqual([
      sameTime,
    ]);
    const laterCreated = {
      ...first,
      createdAt: new Date("2026-09-02T00:00:00Z"),
    };
    expect(selectCompletionReports([sameTime, laterCreated]).selected).toEqual([
      laterCreated,
    ]);
  });
  it("確認済みの重複は自動で帰属を選び直さず競合として返す", () => {
    const reports = [first, latest].map((report) => ({
      ...report,
      eligibilityConfirmedAt: new Date(),
    }));
    expect(selectCompletionReports(reports)).toEqual({
      selected: [],
      conflicts: new Set(["techguide-jp/example#10"]),
    });
    for (const month of ["2026-08", "2026-09"]) {
      const summaries = buildSettlementSummariesV2(month, [issue], [], [], {
        completionReports: reports,
        supplementalPayments: [],
      });
      expect(
        summaries.some((summary) =>
          summary.blockingReasons.some((reason) =>
            reason.includes("完了確認済みの報告が複数"),
          ),
        ),
      ).toBe(true);
    }
  });
  it("月抽出前に選択し、旧担当者の8月時間報酬は保持する", () => {
    const sessions = [
      {
        id: "session-1",
        assigneeLogin: "worker",
        repository: issue.repository,
        issueNumber: issue.number,
        issueTitle: issue.title,
        startedAt: new Date("2026-08-20T00:00:00Z"),
        endedAt: new Date("2026-08-20T01:00:00Z"),
        excludedAt: null,
        excludeReason: null,
        createdBy: "worker",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const options = {
      completionReports: [first, latest],
      supplementalPayments: [],
    };
    const august = buildSettlementSummariesV2(
      "2026-08",
      [issue],
      sessions,
      [],
      options,
    ).find((row) => row.assigneeLogin === "worker");
    expect(august).toMatchObject({ fixedRewardYen: 0, timedRewardYen: 6000 });
    expect(august?.unsettledProjectIssues).toEqual([]);
    const confirmed = { ...latest, eligibilityConfirmedAt: new Date() };
    const september = buildSettlementSummariesV2(
      "2026-09",
      [issue],
      sessions,
      [],
      { ...options, completionReports: [first, confirmed] },
    );
    expect(
      september.find((row) => row.assigneeLogin === "replacement"),
    ).toMatchObject({ fixedRewardYen: 50_000, timedRewardYen: 0 });
  });
});
