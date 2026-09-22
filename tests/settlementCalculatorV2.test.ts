import { restoreSettlementSummary } from "$lib/server/settlements/settlementSnapshotRestore";
import { buildNoticeDocument } from "$lib/server/notices/noticeService";
import { describe, expect, it } from "vitest";
import type { IssueCompletionReport, WorkSession } from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { buildSettlementSummariesV2 } from "$lib/server/settlements/settlementCalculatorV2";
import { getWorkSubmissionBlockingReasons } from "$lib/server/settlements/settlementService";
import {
  createSettlementSnapshotPayload,
  hasWorkSubmissionChanges,
  settlementSnapshotCompletionReportIds,
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
  it.each(["2026-08", "2026-09"])(
    "管理者が%sへ精算月を指定しても作業者に再申請を求めず、稼働変更は検出する",
    (assignedMonth) => {
      const before = build("2026-08", {
        completionReports: [],
        supplementalPayments: [],
      })!;
      const snapshot = createSettlementSnapshotPayload(before);
      const options = {
        completionReports: [
          report({
            source: "admin_confirmation",
            settlementMonth: assignedMonth,
          }),
        ],
        supplementalPayments: [],
      };
      const after = build("2026-08", options)!;
      expect(before.unsettledProjectIssues.map((line) => line.reason)).toEqual([
        "settlement_month_unassigned",
      ]);
      expect(after.unsettledProjectIssues).toHaveLength(0);
      expect(hasWorkSubmissionChanges(snapshot, after)).toBe(false);
      const edited = build("2026-08", options, [
        session({ endedAt: new Date("2026-08-20T02:00:00Z") }),
      ])!;
      expect(hasWorkSubmissionChanges(snapshot, edited)).toBe(true);
    },
  );
  it("完了済みでも精算月の指定前は固定報酬を計上せず、作業者へ報告を要求しない", () => {
    const summary = build(
      "2026-09",
      { completionReports: [], supplementalPayments: [] },
      [],
    );
    expect(summary?.fixedRewardYen).toBe(0);
    expect(summary?.unsettledProjectIssues.map((line) => line.reason)).toEqual([
      "settlement_month_unassigned",
    ]);
    expect(summary?.approvalRequired).toBe(false);
  });
  it("管理者指定月にだけ固定報酬を計上し、別月に報告未提出と表示しない", () => {
    const options = {
      completionReports: [
        report({
          source: "admin_confirmation",
          settlementMonth: "2026-07",
          reportedAt: new Date("2026-09-10T00:00:00Z"),
        }),
      ],
      supplementalPayments: [],
    };
    expect(build("2026-07", options, [])?.fixedRewardYen).toBe(50000);
    expect(build("2026-09", options, [])?.fixedRewardYen ?? 0).toBe(0);
    expect(build("2026-08", options)?.unsettledProjectIssues).toHaveLength(0);
  });
  it("すでに精算済みのIssueを精算月指定待ちとして再表示しない", () => {
    expect(
      build(
        "2026-09",
        {
          completionReports: [],
          supplementalPayments: [],
          unassignedCompletedIssueKeys: new Set(),
        },
        [],
      ),
    ).toBeUndefined();
  });
  it("8月完了報告を9月に完了確認しても固定報酬を8月へ帰属させる", () => {
    const summary = build("2026-08", {
      completionReports: [report()],
      supplementalPayments: [],
    });

    expect(summary?.fixedRewardYen).toBe(50_000);
    expect(summary?.timedRewardYen).toBe(6_000);
    expect(summary?.lines[0].completionReportId).toBe(report().id);
  });

  it("確認済み報告が重複する既存データは表示を保ち、新しい申請・承認をブロックする", () => {
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
    for (const summary of summaries) {
      expect(getWorkSubmissionBlockingReasons(summary).join(" ")).toContain(
        "完了確認済みの報告が複数",
      );
    }
  });

  it("別作業者の承認済みスナップショットに含まれる完了報告を再計上しない", () => {
    const summary = build("2026-08", {
      completionReports: [report()],
      supplementalPayments: [],
      settledCompletionReportAssignees: new Map([
        [report().id, new Set(["replacement-worker"])],
      ]),
    });

    expect(summary?.fixedRewardYen).toBe(0);
    expect(summary?.lines[0].completionReportId).toBeNull();
  });

  it("同じ作業者の承認済みスナップショットに含まれる完了報告は現在明細に残す", () => {
    const summary = build("2026-08", {
      completionReports: [report()],
      supplementalPayments: [],
      settledCompletionReportAssignees: new Map([
        [report().id, new Set([report().assigneeLogin])],
      ]),
    });

    expect(summary?.fixedRewardYen).toBe(50_000);
    expect(summary?.lines[0].completionReportId).toBe(report().id);
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

  it("承認済みスナップショットから固定報酬の完了報告IDを復元する", () => {
    const summary = build("2026-08", {
      completionReports: [report()],
      supplementalPayments: [],
    });
    const reportIds = settlementSnapshotCompletionReportIds(
      createSettlementSnapshotPayload(summary!),
    );

    expect(reportIds).toEqual(new Set([report().id]));
  });

  it("月またぎの上限残額を古い月から配分する", () => {
    const sessions = [
      session({
        startedAt: new Date("2026-08-31T14:00:00Z"),
        endedAt: new Date("2026-08-31T16:00:00Z"),
      }),
    ];
    const options = { completionReports: [], supplementalPayments: [] };
    const values = ["2026-08", "2026-09"].map(
      (month) =>
        buildSettlementSummariesV2(
          month,
          [issue({ extraCapYen: 10000 })],
          sessions,
          [],
          options,
        )[0],
    );
    expect(values.map((s) => s.timedRewardYen)).toEqual([6000, 4000]);
    expect(values.every((s) => s.blockingReasons.length === 0)).toBe(true);
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
      summaries.reduce((total, summary) => total + summary.timedRewardYen, 0),
    ).toBe(10000);

    expect(
      summaries.find((summary) => summary.assigneeLogin === "worker")
        ?.blockingReasons,
    ).not.toContain(capWarning);
    expect(
      summaries.find((summary) => summary.assigneeLogin === "replacement")
        ?.blockingReasons,
    ).not.toContain(capWarning);
  });

  it.each([0, 1000, null])(
    "上限%s円を適用し、稼働時間と固定報酬を保持する",
    (cap) => {
      const [summary] = buildSettlementSummariesV2(
        "2026-08",
        [issue({ extraCapYen: cap, hourlyRateYen: 300 })],
        [session({ endedAt: new Date("2026-08-20T18:00:00Z") })],
        [],
        {
          completionReports: [report({ fixedRewardYen: 2500 })],
          supplementalPayments: [],
        },
      );
      expect(summary.lines[0].workMinutes).toBe(1080);
      expect(summary.fixedRewardYen).toBe(2500);
      expect(summary.timedRewardYen).toBe(cap === null ? 5400 : cap);
      expect(summary.taxIncludedYen).toBe(
        cap === null ? 8690 : cap === 0 ? 2750 : 3850,
      );
      expect(summary.blockingReasons).toEqual([]);
      const restored = restoreSettlementSummary(
        createSettlementSnapshotPayload(summary),
      );
      expect(restored?.lines[0].timedRewardCalculation).toEqual({
        uncappedYen: 5400,
        capYen: cap,
      });
      expect(buildNoticeDocument(restored!).lines[0].timedRewardYen).toBe(
        summary.timedRewardYen,
      );
    },
  );

  it("ログごとの円丸めを維持し、入力順に依存せず上限を配分する", () => {
    const sessions = [
      session({
        id: "a",
        startedAt: new Date("2026-08-20T00:00:00Z"),
        endedAt: new Date("2026-08-20T00:01:00Z"),
      }),
      session({
        id: "b",
        assigneeLogin: "replacement",
        startedAt: new Date("2026-08-20T01:00:00Z"),
        endedAt: new Date("2026-08-20T01:01:00Z"),
      }),
    ];
    const calculate = (logs: WorkSession[]) =>
      buildSettlementSummariesV2(
        "2026-08",
        [issue({ hourlyRateYen: 1000, extraCapYen: 33 })],
        logs,
        [],
        { completionReports: [], supplementalPayments: [] },
      );
    const summaries = calculate(sessions);
    expect(calculate([...sessions].reverse())).toEqual(summaries);
    expect(
      summaries.map((summary) => [
        summary.assigneeLogin,
        summary.timedRewardYen,
      ]),
    ).toEqual([
      ["replacement", 16],
      ["worker", 17],
    ]);
    expect(
      summaries.reduce(
        (sum, summary) =>
          sum + summary.lines[0].timedRewardCalculation!.uncappedYen,
        0,
      ),
    ).toBe(34);
    const snapshot = createSettlementSnapshotPayload(summaries[0]);
    snapshot.source.lines[0].timedRewardCalculation!.capYen = 99999;
    expect(restoreSettlementSummary(snapshot)).toBeNull();
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

  it("複数担当Issueの完了確認待ち完了報告だけを持つ作業者も申請をブロックする", () => {
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
      "completion_waiting",
    );
    expect(reporterSummary?.blockingReasons).toContain(assignmentWarning);
    expect(sessionOwnerSummary?.blockingReasons).toContain(assignmentWarning);
  });

  it("上限超過でも完了確認待ちの報告と時間報酬を申請できる", () => {
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
      summaries.reduce((total, summary) => total + summary.timedRewardYen, 0),
    ).toBe(10000);

    expect(
      summaries.find((summary) => summary.assigneeLogin === "worker")
        ?.blockingReasons,
    ).not.toContain(capWarning);
    expect(
      summaries.find((summary) => summary.assigneeLogin === "replacement")
        ?.blockingReasons,
    ).not.toContain(capWarning);
  });

  it("同じ完了報告のIssue完了反映だけでは再申請扱いにしない", () => {
    const pendingReport = report({ eligibilityConfirmedAt: null });
    const beforeCompletion = build("2026-08", {
      completionReports: [pendingReport],
      supplementalPayments: [],
    });
    const afterCompletion = build("2026-08", {
      completionReports: [report()],
      supplementalPayments: [],
    });
    expect(beforeCompletion).toBeDefined();
    expect(afterCompletion).toBeDefined();

    const snapshot = createSettlementSnapshotPayload(beforeCompletion!);
    expect(hasWorkSubmissionChanges(snapshot, afterCompletion!)).toBe(false);
  });
});
