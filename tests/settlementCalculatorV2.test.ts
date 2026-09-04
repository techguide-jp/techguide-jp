import { describe, expect, it } from "vitest";
import type { IssueCompletionReport, WorkSession } from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { buildSettlementSummariesV2 } from "$lib/server/settlements/settlementCalculatorV2";
import { getWorkSubmissionBlockingReasons } from "$lib/server/settlements/settlementService";
import {
  createSettlementSnapshotPayload,
  hasWorkSubmissionChanges,
  settlementSnapshotHourlyRates,
} from "$lib/server/settlements/settlementSnapshot";

const issue = (overrides: Partial<ProjectIssue> = {}): ProjectIssue => ({
  projectItemId: "item-1",
  repository: "techguide-jp/example",
  number: 10,
  title: "精算ルールを実装する",
  state: "CLOSED",
  url: "https://github.com/techguide-jp/example/issues/10",
  createdAt: "2026-08-01T00:00:00Z",
  closedAt: "2026-09-10T00:00:00Z",
  assignees: ["worker"],
  status: "Done",
  rewardMode: "ハイブリッド",
  fixedRewardYen: 50_000,
  extraCapYen: 30_000,
  hourlyRateYen: 6_000,
  ...overrides,
});

const session = (overrides: Partial<WorkSession> = {}): WorkSession => ({
  id: "10000000-0000-4000-8000-000000000001",
  assigneeLogin: "worker",
  repository: "techguide-jp/example",
  issueNumber: 10,
  issueTitle: "精算ルールを実装する",
  startedAt: new Date("2026-08-20T00:00:00Z"),
  endedAt: new Date("2026-08-20T01:00:00Z"),
  createdBy: "worker",
  createdAt: new Date("2026-08-20T00:00:00Z"),
  updatedAt: new Date("2026-08-20T01:00:00Z"),
  excludedAt: null,
  excludeReason: null,
  ...overrides,
});

const report = (
  overrides: Partial<IssueCompletionReport> = {},
): IssueCompletionReport => ({
  id: "20000000-0000-4000-8000-000000000001",
  projectItemId: "item-1",
  repository: "techguide-jp/example",
  issueNumber: 10,
  issueTitle: "精算ルールを実装する",
  issueUrl: "https://github.com/techguide-jp/example/issues/10",
  assigneeLogin: "worker",
  settlementMonth: "2026-08",
  reportedAt: new Date("2026-08-31T14:00:00Z"),
  rewardMode: "ハイブリッド",
  fixedRewardYen: 50_000,
  source: "worker",
  evidenceUrl: null,
  evidenceNote: null,
  invalidatedAt: null,
  invalidatedBy: null,
  invalidationReason: null,
  eligibilityConfirmedAt: new Date("2026-09-10T00:00:00Z"),
  createdBy: "worker",
  createdAt: new Date("2026-08-31T14:00:00Z"),
  ...overrides,
});

const build = (
  month: string,
  options: Parameters<typeof buildSettlementSummariesV2>[4],
  sessions: WorkSession[] = [session()],
) =>
  buildSettlementSummariesV2(month, [issue()], sessions, [], options).find(
    (summary) => summary.assigneeLogin === "worker",
  );

describe("buildSettlementSummariesV2", () => {
  it("8月完了報告を9月にマージしても固定報酬を8月へ帰属させる", () => {
    const summary = build("2026-08", {
      completionReports: [report()],
      supplementalPayments: [],
    });

    expect(summary?.fixedRewardYen).toBe(50_000);
    expect(summary?.timedRewardYen).toBe(6_000);
    expect(summary?.lines[0].completionReportId).toBe(report().id);
  });

  it("Issue再割り当て後も完了報告ごとの作業者へ固定報酬を帰属させる", () => {
    const summaries = buildSettlementSummariesV2(
      "2026-08",
      [issue({ assignees: ["replacement"] })],
      [],
      [],
      {
        completionReports: [
          report(),
          report({
            id: "20000000-0000-4000-8000-000000000002",
            assigneeLogin: "replacement",
            fixedRewardYen: 30_000,
          }),
        ],
        supplementalPayments: [],
      },
    );

    expect(
      summaries.find((summary) => summary.assigneeLogin === "worker")
        ?.fixedRewardYen,
    ).toBe(50_000);
    expect(
      summaries.find((summary) => summary.assigneeLogin === "replacement")
        ?.fixedRewardYen,
    ).toBe(30_000);
  });

  it("9月の再稼働・再報告では固定報酬だけ9月へ移し、8月の時間報酬を残す", () => {
    const oldReport = report({
      invalidatedAt: new Date("2026-09-02T00:00:00Z"),
      invalidatedBy: "worker",
      invalidationReason: "new_work_started",
      eligibilityConfirmedAt: null,
    });
    const newReport = report({
      id: "20000000-0000-4000-8000-000000000002",
      settlementMonth: "2026-09",
      reportedAt: new Date("2026-09-03T00:00:00Z"),
      eligibilityConfirmedAt: new Date("2026-09-10T00:00:00Z"),
    });
    const august = build("2026-08", {
      completionReports: [oldReport],
      supplementalPayments: [],
    });
    const september = build(
      "2026-09",
      { completionReports: [newReport], supplementalPayments: [] },
      [],
    );

    expect(august?.fixedRewardYen).toBe(0);
    expect(august?.timedRewardYen).toBe(6_000);
    expect(september?.fixedRewardYen).toBe(50_000);
    expect(september?.timedRewardYen).toBe(0);
  });

  it("JST月境界をまたぐログを各月30分ずつに分割する", () => {
    const crossing = session({
      startedAt: new Date("2026-08-31T14:30:00Z"),
      endedAt: new Date("2026-08-31T15:30:00Z"),
    });
    const options = { completionReports: [], supplementalPayments: [] };

    expect(build("2026-08", options, [crossing])?.lines[0].workMinutes).toBe(
      30,
    );
    expect(build("2026-09", options, [crossing])?.lines[0].workMinutes).toBe(
      30,
    );
  });

  it("申請済みの時間単価スナップショットを優先する", () => {
    const summary = build("2026-08", {
      completionReports: [],
      supplementalPayments: [],
      frozenHourlyRates: new Map([["techguide-jp/example#10#worker", 4_000]]),
    });

    expect(summary?.timedRewardYen).toBe(4_000);
    expect(summary?.lines[0].hourlyRateYenSnapshot).toBe(4_000);
  });

  it("申請済みの時間単価を作業者ごとに分離する", () => {
    const summaries = buildSettlementSummariesV2(
      "2026-08",
      [issue({ assignees: ["replacement"], hourlyRateYen: 5_000 })],
      [
        session(),
        session({
          id: "10000000-0000-4000-8000-000000000002",
          assigneeLogin: "replacement",
        }),
      ],
      [],
      {
        completionReports: [],
        supplementalPayments: [],
        frozenHourlyRates: new Map([["techguide-jp/example#10#worker", 4_000]]),
      },
    );

    expect(
      summaries.find((summary) => summary.assigneeLogin === "worker")
        ?.timedRewardYen,
    ).toBe(4_000);
    expect(
      summaries.find((summary) => summary.assigneeLogin === "replacement")
        ?.timedRewardYen,
    ).toBe(5_000);
  });

  it("申請スナップショットの時間単価をIssueと作業者の組で復元する", () => {
    const summary = build("2026-08", {
      completionReports: [],
      supplementalPayments: [],
    });
    const rates = settlementSnapshotHourlyRates(
      createSettlementSnapshotPayload(summary!),
    );

    expect(rates.get("techguide-jp/example#10#worker")).toBe(6_000);
    expect(rates.has("techguide-jp/example#10")).toBe(false);
  });

  it("他月を含む時間報酬累計が追加精算上限を超えたらブロックする", () => {
    const summary = build("2026-08", {
      completionReports: [],
      supplementalPayments: [],
      priorTimedRewardByIssue: new Map([["techguide-jp/example#10", 25_000]]),
    });

    expect(summary?.blockingReasons).toContain(
      "techguide-jp/example#10: Issue全期間の時間精算額が追加精算上限を超えています。",
    );
    expect(getWorkSubmissionBlockingReasons(summary!)).toContain(
      "techguide-jp/example#10: Issue全期間の時間精算額が追加精算上限を超えています。",
    );
  });

  it("複数作業者の当月時間報酬をIssue単位で合算して上限判定する", () => {
    const summaries = buildSettlementSummariesV2(
      "2026-08",
      [issue({ assignees: ["replacement"], extraCapYen: 10_000 })],
      [
        session(),
        session({
          id: "10000000-0000-4000-8000-000000000002",
          assigneeLogin: "replacement",
        }),
      ],
      [],
      { completionReports: [], supplementalPayments: [] },
    );
    const capWarning =
      "techguide-jp/example#10: Issue全期間の時間精算額が追加精算上限を超えています。";

    expect(
      summaries.find((summary) => summary.assigneeLogin === "worker")
        ?.blockingReasons,
    ).toContain(capWarning);
    expect(
      summaries.find((summary) => summary.assigneeLogin === "replacement")
        ?.blockingReasons,
    ).toContain(capWarning);
  });

  it("現在のIssueが複数担当者なら保存済みログの帰属を保ったまま申請をブロックする", () => {
    const summary = buildSettlementSummariesV2(
      "2026-08",
      [issue({ assignees: ["worker", "replacement"] })],
      [session()],
      [],
      { completionReports: [], supplementalPayments: [] },
    ).find((candidate) => candidate.assigneeLogin === "worker");

    expect(summary?.timedRewardYen).toBe(6_000);
    expect(summary?.blockingReasons).toContain(
      "techguide-jp/example#10: assigneeが単一ではありません。",
    );
    expect(getWorkSubmissionBlockingReasons(summary!)).toContain(
      "techguide-jp/example#10: assigneeが単一ではありません。",
    );
  });

  it("複数担当Issueの未マージ完了報告だけを持つ作業者も申請をブロックする", () => {
    const summaries = buildSettlementSummariesV2(
      "2026-08",
      [issue({ assignees: ["worker", "replacement"] })],
      [
        session({
          assigneeLogin: "replacement",
        }),
      ],
      [],
      {
        completionReports: [report({ eligibilityConfirmedAt: null })],
        supplementalPayments: [],
      },
    );
    const assignmentWarning =
      "techguide-jp/example#10: assigneeが単一ではありません。";
    const reporterSummary = summaries.find(
      (summary) => summary.assigneeLogin === "worker",
    );
    const sessionOwnerSummary = summaries.find(
      (summary) => summary.assigneeLogin === "replacement",
    );

    expect(reporterSummary?.unsettledProjectIssues[0].reason).toBe(
      "merge_waiting",
    );
    expect(reporterSummary?.blockingReasons).toContain(assignmentWarning);
    expect(sessionOwnerSummary?.blockingReasons).toContain(assignmentWarning);
  });

  it("上限超過Issueの未マージ完了報告だけを持つ作業者も申請をブロックする", () => {
    const summaries = buildSettlementSummariesV2(
      "2026-08",
      [issue({ assignees: ["replacement"], extraCapYen: 10_000 })],
      [
        session({
          assigneeLogin: "replacement",
          endedAt: new Date("2026-08-20T02:00:00Z"),
        }),
      ],
      [],
      {
        completionReports: [report({ eligibilityConfirmedAt: null })],
        supplementalPayments: [],
      },
    );
    const capWarning =
      "techguide-jp/example#10: Issue全期間の時間精算額が追加精算上限を超えています。";

    expect(
      summaries.find((summary) => summary.assigneeLogin === "worker")
        ?.blockingReasons,
    ).toContain(capWarning);
    expect(
      summaries.find((summary) => summary.assigneeLogin === "replacement")
        ?.blockingReasons,
    ).toContain(capWarning);
  });

  it("同じ完了報告のPRマージ反映だけでは再申請扱いにしない", () => {
    const pendingReport = report({ eligibilityConfirmedAt: null });
    const beforeMerge = build("2026-08", {
      completionReports: [pendingReport],
      supplementalPayments: [],
    });
    const afterMerge = build("2026-08", {
      completionReports: [report()],
      supplementalPayments: [],
    });
    expect(beforeMerge).toBeDefined();
    expect(afterMerge).toBeDefined();

    const snapshot = createSettlementSnapshotPayload(beforeMerge!);
    expect(hasWorkSubmissionChanges(snapshot, afterMerge!)).toBe(false);
  });
});
