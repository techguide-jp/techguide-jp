import { describe, expect, it } from "vitest";
import { completionReport } from "./fixtures/completionReport";
import { buildSettlementSummariesV2 } from "$lib/server/settlements/settlementCalculatorV2";
import { getWorkSubmissionBlockingReasons } from "$lib/server/settlements/settlementService";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import type { WorkSession } from "$lib/server/db/schema";

const first = completionReport({
  eligibilityConfirmedAt: new Date("2026-09-10T00:00:00Z"),
});
const second = completionReport({
  id: "20000000-0000-4000-8000-000000000002",
  assigneeLogin: "replacement",
  eligibilityConfirmedAt: first.eligibilityConfirmedAt,
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
  extraCapYen: null,
};
const reason =
  "techguide-jp/example#10: 同じIssueに完了確認済みの報告が複数あります。管理者に確認してください。";

describe("Project内外の完了報告重複ブロック", () => {
  it.each([true, false])(
    "Projectに含まれる=%s: 同月の両報告者を重複せずブロックする",
    (inProject) => {
      const summaries = buildSettlementSummariesV2(
        "2026-08",
        inProject ? [issue] : [],
        [],
        [],
        {
          completionReports: [first, second],
          supplementalPayments: [],
        },
      );
      expect(summaries).toHaveLength(2);
      for (const summary of summaries) {
        expect(summary.approvalRequired).toBe(true);
        expect(summary.blockingReasons).toEqual([reason]);
        expect(getWorkSubmissionBlockingReasons(summary)).toEqual([reason]);
      }
    },
  );

  it.each(["2026-08", "2026-09"])(
    "Project外で月をまたぐ重複も%s分の報告者に伝える",
    (month) => {
      const later = {
        ...second,
        settlementMonth: "2026-09",
        reportedAt: new Date("2026-09-01T00:00:00Z"),
      };
      const summaries = buildSettlementSummariesV2(month, [], [], [], {
        completionReports: [first, later],
        supplementalPayments: [],
      });
      expect(summaries).toHaveLength(1);
      expect(summaries[0].assigneeLogin).toBe(
        month === "2026-08" ? "worker" : "replacement",
      );
      expect(summaries[0].blockingReasons).toEqual([reason]);
      expect(summaries[0].approvalRequired).toBe(true);
    },
  );

  it("他Issueの明細と金額を保ち、重複に関係しない作業者はブロックしない", () => {
    const otherIssue = { ...issue, number: 11, assignees: ["worker"] };
    const reports = [
      first,
      second,
      completionReport({
        id: "other-report",
        issueNumber: 11,
        eligibilityConfirmedAt: first.eligibilityConfirmedAt,
      }),
      completionReport({
        id: "unrelated-report",
        issueNumber: 12,
        assigneeLogin: "unrelated",
        eligibilityConfirmedAt: first.eligibilityConfirmedAt,
      }),
    ];
    const summaries = buildSettlementSummariesV2(
      "2026-08",
      [otherIssue, { ...otherIssue, number: 12, assignees: ["unrelated"] }],
      [],
      [],
      {
        completionReports: reports,
        supplementalPayments: [],
      },
    );
    const worker = summaries.find(
      (summary) => summary.assigneeLogin === "worker",
    );
    expect(worker).toMatchObject({
      fixedRewardYen: 50_000,
      taxIncludedYen: 55_000,
      blockingReasons: [reason],
    });
    expect(worker?.lines.map((line) => line.issue.number)).toEqual([11]);
    expect(
      summaries.find((summary) => summary.assigneeLogin === "unrelated"),
    ).toMatchObject({ fixedRewardYen: 50_000, blockingReasons: [] });
  });

  it.each([true, false])(
    "Projectに含まれる=%s: 同月の稼働者にも伝え、対象月外の稼働者には伝えない",
    (inProject) => {
      const session: WorkSession = {
        id: "session",
        assigneeLogin: "session-worker",
        repository: issue.repository,
        issueNumber: issue.number,
        issueTitle: issue.title,
        startedAt: new Date("2026-08-20T00:00:00Z"),
        endedAt: new Date("2026-08-20T01:00:00Z"),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "session-worker",
        excludedAt: null,
        excludeReason: null,
      };
      const summaries = buildSettlementSummariesV2(
        "2026-08",
        inProject ? [issue] : [],
        [
          session,
          {
            ...session,
            id: "outside-month",
            assigneeLogin: "outside-month",
            startedAt: new Date("2026-07-01T00:00:00Z"),
            endedAt: new Date("2026-07-01T01:00:00Z"),
          },
        ],
        [],
        { completionReports: [first, second], supplementalPayments: [] },
      );
      expect(
        summaries.find((summary) => summary.assigneeLogin === "session-worker")
          ?.blockingReasons,
      ).toEqual([reason]);
      expect(
        summaries.find((summary) => summary.assigneeLogin === "outside-month")
          ?.blockingReasons,
      ).toEqual([]);
    },
  );

  it("失効した旧報告を重複として扱わない", () => {
    const summaries = buildSettlementSummariesV2("2026-08", [], [], [], {
      completionReports: [first, { ...second, invalidatedAt: new Date() }],
      supplementalPayments: [],
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].blockingReasons).toEqual([]);
  });
});
