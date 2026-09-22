import { describe, expect, it } from "vitest";
import { buildChangeRequestPreviews } from "$lib/server/settlements/changeRequestPreview";
import { buildSettlementSummariesV2 } from "$lib/server/settlements/settlementCalculatorV2";
import { createSettlementSnapshotPayload } from "$lib/server/settlements/settlementSnapshot";
import type { WorkLogChangeRequest, WorkSession } from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { completionReport } from "./fixtures/completionReport";

const issue: ProjectIssue = {
  projectItemId: "item-1",
  repository: "techguide-jp/example",
  number: 10,
  title: "確認用",
  url: "https://github.com/techguide-jp/example/issues/10",
  state: "CLOSED",
  status: "Done",
  assignees: ["worker"],
  createdAt: "2026-08-01T00:00:00Z",
  closedAt: "2026-09-04T00:00:00Z",
  rewardMode: "ハイブリッド",
  fixedRewardYen: 2500,
  hourlyRateYen: 300,
  extraCapYen: 1000,
};
const session = (overrides: Partial<WorkSession> = {}): WorkSession => ({
  id: "session-1",
  repository: issue.repository,
  issueNumber: issue.number,
  issueTitle: issue.title,
  assigneeLogin: "worker",
  startedAt: new Date("2026-08-21T13:00:00Z"),
  endedAt: new Date("2026-09-06T12:00:00Z"),
  createdBy: "worker",
  createdAt: new Date("2026-08-21T13:00:00Z"),
  updatedAt: new Date("2026-09-06T12:00:00Z"),
  excludedAt: null,
  excludeReason: null,
  ...overrides,
});
const request = (
  overrides: Partial<WorkLogChangeRequest> = {},
): WorkLogChangeRequest => ({
  id: "request-1",
  repository: issue.repository,
  issueNumber: issue.number,
  issueTitle: issue.title,
  assigneeLogin: "worker",
  requestedBy: "worker",
  status: "pending",
  requestType: "edit",
  targetSessionId: "session-1",
  requestedStartedAt: new Date("2026-08-21T13:00:00Z"),
  requestedEndedAt: new Date("2026-08-22T07:00:00Z"),
  reason: "18時間に修正",
  createdAt: new Date("2026-09-21T01:00:00Z"),
  reviewedAt: null,
  reviewedBy: null,
  reviewNote: null,
  ...overrides,
});
const input = (
  overrides: Partial<Parameters<typeof buildChangeRequestPreviews>[0]> = {},
): Parameters<typeof buildChangeRequestPreviews>[0] => ({
  month: "2026-08",
  ruleVersion: 2,
  visibleRequests: [request()],
  issues: [issue],
  sessions: [session()],
  requests: [request()],
  snapshots: [],
  completionReports: [
    completionReport({
      fixedRewardYen: 2500,
      eligibilityConfirmedAt: new Date("2026-09-05T00:00:00Z"),
    }),
  ],
  supplementalPayments: [],
  frozenHourlyRates: new Map(),
  settledCompletionReportAssignees: new Map(),
  projectFetchError: null,
  ...overrides,
});

describe("修正申請の承認前プレビュー", () => {
  it("旧ルールでは8月0円の理由と9月3,850円を表示する", () => {
    const [preview] = buildChangeRequestPreviews(input({ ruleVersion: 1 }));
    expect(preview.error).toBeNull();
    expect(
      preview.months.map((month) => [month.month, month.after.taxIncludedYen]),
    ).toEqual([
      ["2026-08", 0],
      ["2026-09", 3850],
    ]);
    expect(preview.months[1].issueDetail).toMatchObject({
      workMinutes: 1080,
      timedRewardYen: 1000,
      calculation: { uncappedYen: 5400, capYen: 1000 },
    });
    expect(preview.notes.join(" ")).toContain("Issue完了月（2026年9月）");
  });

  it("V2では修正後の8月の固定・時間報酬と、消えた9月分を比較できる", () => {
    const [preview] = buildChangeRequestPreviews(input());
    expect(preview.error).toBeNull();
    expect(preview.months[0].after).toEqual({
      fixedRewardYen: 2500,
      timedRewardYen: 1000,
      taxExcludedYen: 3500,
      taxIncludedYen: 3850,
    });
    expect(preview.months[0].issueDetail?.workMinutes).toBe(1080);
    expect(preview.months[1].issueDetail).toBeNull();
  });

  it.each(["add", "edit", "exclude"] as const)(
    "%sの試算は実際に承認状態へ変えて計算した金額と一致し、入力を変更しない",
    (requestType) => {
      const req = request({
        requestType,
        targetSessionId: requestType === "add" ? null : "session-1",
      });
      const context = input({
        requests: [req],
        visibleRequests: [req],
        issues: [{ ...issue, extraCapYen: null }],
      });
      const original = structuredClone(context);
      const [preview] = buildChangeRequestPreviews(context);
      const [approved] = buildSettlementSummariesV2(
        "2026-08",
        context.issues,
        context.sessions,
        [{ ...req, status: "approved", reviewedAt: new Date() }],
        {
          completionReports: context.completionReports,
          supplementalPayments: [],
        },
      );
      expect(preview.months[0].after.taxIncludedYen).toBe(
        approved.taxIncludedYen,
      );
      expect(context).toEqual(original);
    },
  );

  it("同じログの未処理申請は一件ずつ計算し、過去の承認済み修正より後に適用する", () => {
    const older = request({
      id: "old",
      status: "approved",
      reviewedAt: new Date("2026-09-21T02:00:00Z"),
      requestedEndedAt: new Date("2026-08-21T14:00:00Z"),
    });
    const another = request({
      id: "another",
      requestedEndedAt: new Date("2026-08-21T15:00:00Z"),
    });
    const context = input({
      visibleRequests: [request(), another],
      requests: [older, request(), another],
      issues: [{ ...issue, extraCapYen: null }],
    });
    const previews = buildChangeRequestPreviews(context);
    expect(
      previews.map((preview) => preview.months[0].issueDetail?.workMinutes),
    ).toEqual([1080, 120]);
    expect(previews[0].notes.join(" ")).toContain("この申請だけ");
  });

  it("月境界をJSTで分割し、上限が移る後月の金額も更新する", () => {
    const first = session({
      startedAt: new Date("2026-08-31T14:00:00Z"),
      endedAt: new Date("2026-08-31T16:00:00Z"),
    });
    const req = request({
      requestedStartedAt: first.startedAt,
      requestedEndedAt: new Date("2026-08-31T14:30:00Z"),
    });
    const [preview] = buildChangeRequestPreviews(
      input({
        issues: [{ ...issue, hourlyRateYen: 6000, extraCapYen: 10000 }],
        completionReports: [],
        sessions: [
          first,
          session({
            id: "session-2",
            startedAt: new Date("2026-09-05T00:00:00Z"),
            endedAt: new Date("2026-09-05T01:00:00Z"),
          }),
        ],
        visibleRequests: [req],
        requests: [req],
      }),
    );
    expect(
      preview.months.map((month) => [
        month.before.timedRewardYen,
        month.after.timedRewardYen,
      ]),
    ).toEqual([
      [6000, 3000],
      [4000, 6000],
    ]);
  });

  it("月次承認済みの金額を保持し、保存済みの時間単価を使用する", () => {
    const context = input({
      frozenHourlyRates: new Map([[`${issue.repository}#10#worker`, 600]]),
    });
    const [saved] = buildSettlementSummariesV2(
      "2026-08",
      [issue],
      [session()],
      [],
      {
        completionReports: context.completionReports,
        supplementalPayments: [],
      },
    );
    context.snapshots = [
      {
        month: "2026-08",
        assigneeLogin: "worker",
        approvedBy: "admin",
        approvedAt: new Date(),
        snapshot: createSettlementSnapshotPayload(saved),
      },
    ];
    const [preview] = buildChangeRequestPreviews(context);
    expect(preview.months[0].approved).toBe(true);
    expect(preview.months[0].after.taxIncludedYen).toBe(saved.taxIncludedYen);
    context.snapshots = [];
    const [unsaved] = buildChangeRequestPreviews(context);
    expect(unsaved.months[0].issueDetail?.calculation?.uncappedYen).toBe(10800);
  });

  it("未確定の完了報告を無効にする承認では再提出の必要性を伝える", () => {
    const [preview] = buildChangeRequestPreviews(
      input({
        completionReports: [
          completionReport({ reportedAt: new Date("2026-08-21T14:00:00Z") }),
        ],
      }),
    );
    expect(preview.notes.join(" ")).toContain("再提出が必要");
    expect(preview.months[0].after.fixedRewardYen).toBe(0);
  });

  it.each(["project", "issue", "target", "snapshot", "rate"])(
    "%sを確認できないときは0円の見込みにしない",
    (failure) => {
      const context = input();
      if (failure === "project") context.projectFetchError = "接続失敗";
      if (failure === "issue") context.issues = [];
      if (failure === "target") context.sessions = [];
      if (failure === "snapshot")
        context.snapshots = [
          {
            month: "2026-07",
            assigneeLogin: "worker",
            approvedBy: "admin",
            approvedAt: new Date(),
            snapshot: {},
          },
        ];
      if (failure === "rate")
        context.issues = [{ ...issue, hourlyRateYen: null }];
      const [preview] = buildChangeRequestPreviews(context);
      expect(preview.error).toBeTruthy();
      expect(preview.months).toEqual([]);
    },
  );
});
