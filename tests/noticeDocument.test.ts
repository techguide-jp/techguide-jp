import { describe, expect, it } from "vitest";
import { buildNoticeDocument } from "$lib/server/notices/noticeService";
import type { WorkSession } from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

const issue: ProjectIssue = {
  projectItemId: "item-1",
  repository: "techguide-jp/example",
  number: 42,
  title: "サンプルIssue",
  state: "CLOSED",
  url: "https://github.com/techguide-jp/example/issues/42",
  createdAt: "2026-06-01T00:00:00Z",
  closedAt: "2026-06-20T00:00:00Z",
  assignees: ["tashua314"],
  status: "Done",
  rewardMode: "ハイブリッド",
  fixedRewardYen: 1000,
  extraCapYen: null,
  hourlyRateYen: 3000,
};

const session = (overrides: Partial<WorkSession>): WorkSession => ({
  id: "session-1",
  assigneeLogin: "tashua314",
  repository: "techguide-jp/example",
  issueNumber: 42,
  issueTitle: "サンプルIssue",
  startedAt: new Date("2026-06-10T01:00:00Z"),
  endedAt: new Date("2026-06-10T01:30:00Z"),
  createdBy: "tashua314",
  createdAt: new Date("2026-06-10T01:00:00Z"),
  updatedAt: new Date("2026-06-10T01:30:00Z"),
  excludedAt: null,
  excludeReason: null,
  ...overrides,
});

const summary: SettlementSummary = {
  month: "2026-06",
  assigneeLogin: "tashua314",
  fixedRewardYen: 1000,
  timedRewardYen: 1500,
  taxExcludedYen: 2500,
  taxYen: 250,
  taxIncludedYen: 2750,
  lines: [
    {
      issue,
      assigneeLogin: "tashua314",
      fixedRewardYen: 1000,
      workMinutes: 30,
      timedRewardYen: 1500,
      taxExcludedYen: 2500,
      warnings: ["assigneeが単一ではありません。"],
      sessions: [
        session({ id: "keep" }),
        session({
          id: "excluded",
          startedAt: new Date("2026-06-11T02:00:00Z"),
          endedAt: new Date("2026-06-11T03:00:00Z"),
          excludedAt: new Date("2026-06-12T00:00:00Z"),
          excludeReason: "重複",
        }),
      ],
    },
  ],
  pendingRequests: [],
  unsettledProjectIssues: [],
  unsettledIssueSessions: [],
  approvalRequired: true,
  blockingReasons: [],
};

describe("buildNoticeDocument", () => {
  it("承認済みサマリーから金額・明細・稼働ログを凍結する", () => {
    const document = buildNoticeDocument(summary);

    expect(document.totals).toEqual({
      fixedRewardYen: 1000,
      timedRewardYen: 1500,
      taxExcludedYen: 2500,
      taxYen: 250,
      taxIncludedYen: 2750,
    });
    expect(document.lines).toHaveLength(1);
    expect(document.lines[0]).toMatchObject({
      repository: "techguide-jp/example",
      issueNumber: 42,
      issueTitle: "サンプルIssue",
      issueUrl: "https://github.com/techguide-jp/example/issues/42",
      rewardMode: "ハイブリッド",
      hourlyRateYen: 3000,
      warnings: ["assigneeが単一ではありません。"],
    });
  });

  it("除外済みの稼働ログは通知書に含めない", () => {
    const document = buildNoticeDocument(summary);

    expect(document.workLogs).toHaveLength(1);
    expect(document.workLogs[0].workMinutes).toBe(30);
    expect(document.workLogs[0].issueTitle).toBe("サンプルIssue");
  });
});
