import { describe, expect, it } from "vitest";
import {
  applyApprovedChangeRequests,
  buildSettlementSummaries,
} from "../src/lib/server/settlements/settlementCalculator";
import {
  createSettlementSnapshotPayload,
  hasSettlementSnapshotChanges,
} from "../src/lib/server/settlements/settlementSnapshot";
import type { ProjectIssue } from "../src/lib/server/github/projectTypes";
import type {
  WorkLogChangeRequest,
  WorkSession,
} from "../src/lib/server/db/schema";

const issue = (overrides: Partial<ProjectIssue> = {}): ProjectIssue => ({
  projectItemId: "item-1",
  repository: "techguide-jp/akademy_fes",
  number: 1,
  title: "Issue",
  state: "CLOSED",
  url: "https://github.com/techguide-jp/akademy_fes/issues/1",
  createdAt: "2026-06-01T00:00:00Z",
  closedAt: "2026-06-30T15:10:00Z",
  assignees: ["koideshogo"],
  status: "Done",
  rewardMode: "ハイブリッド",
  fixedRewardYen: 1000,
  extraCapYen: 5000,
  hourlyRateYen: 6000,
  ...overrides,
});

const session = (overrides: Partial<WorkSession> = {}): WorkSession => ({
  id: crypto.randomUUID(),
  assigneeLogin: "koideshogo",
  repository: "techguide-jp/akademy_fes",
  issueNumber: 1,
  issueTitle: "Issue",
  startedAt: new Date("2026-06-10T01:00:00Z"),
  endedAt: new Date("2026-06-10T01:30:00Z"),
  createdBy: "koideshogo",
  createdAt: new Date("2026-06-10T01:00:00Z"),
  updatedAt: new Date("2026-06-10T01:30:00Z"),
  excludedAt: null,
  excludeReason: null,
  ...overrides,
});

const requests: WorkLogChangeRequest[] = [];

const request = (
  overrides: Partial<WorkLogChangeRequest> = {},
): WorkLogChangeRequest => ({
  id: crypto.randomUUID(),
  requestType: "add",
  status: "approved",
  assigneeLogin: "koideshogo",
  repository: "techguide-jp/akademy_fes",
  issueNumber: 1,
  issueTitle: "Issue",
  targetSessionId: null,
  requestedStartedAt: new Date("2026-06-10T02:00:00Z"),
  requestedEndedAt: new Date("2026-06-10T02:15:00Z"),
  reason: "押し忘れ",
  requestedBy: "koideshogo",
  reviewedBy: "Hiro3737",
  reviewedAt: new Date("2026-06-11T00:00:00Z"),
  reviewNote: null,
  createdAt: new Date("2026-06-10T03:00:00Z"),
  ...overrides,
});

describe("buildSettlementSummaries", () => {
  it("複数Issue同時稼働を各Issueに満額計上する", () => {
    const summaries = buildSettlementSummaries(
      "2026-07",
      [
        issue(),
        issue({ projectItemId: "item-2", number: 2, title: "Issue 2" }),
      ],
      [session(), session({ issueNumber: 2, issueTitle: "Issue 2" })],
      requests,
    );

    expect(summaries[0].timedRewardYen).toBe(6000);
    expect(summaries[0].lines.map((line) => line.workMinutes)).toEqual([
      30, 30,
    ]);
  });

  it("固定Issueの稼働ログは参考表示のみで金額化しない", () => {
    const summaries = buildSettlementSummaries(
      "2026-07",
      [issue({ rewardMode: "固定" })],
      [session()],
      requests,
    );

    expect(summaries[0].lines[0].workMinutes).toBe(30);
    expect(summaries[0].timedRewardYen).toBe(0);
    expect(summaries[0].taxExcludedYen).toBe(1000);
  });

  it("報酬方式が未入力の精算対象Issueを承認ブロックにする", () => {
    const summaries = buildSettlementSummaries(
      "2026-07",
      [issue({ rewardMode: null })],
      [session()],
      requests,
    );

    expect(summaries[0].blockingReasons[0]).toContain("報酬方式");
  });

  it("未終了ログを集計対象外にして警告する", () => {
    const summaries = buildSettlementSummaries(
      "2026-07",
      [issue()],
      [session({ endedAt: null })],
      requests,
    );

    expect(summaries[0].timedRewardYen).toBe(0);
    expect(summaries[0].blockingReasons[0]).toContain("未終了ログ");
  });

  it("時間精算上限超過を承認ブロックにする", () => {
    const summaries = buildSettlementSummaries(
      "2026-07",
      [issue({ extraCapYen: 1000 })],
      [session()],
      requests,
    );

    expect(summaries[0].blockingReasons[0]).toContain("追加精算上限");
  });

  it("承認済み追加申請を有効ログとして集計する", () => {
    const summaries = buildSettlementSummaries(
      "2026-07",
      [issue()],
      [],
      [request()],
    );

    expect(summaries[0].lines[0].workMinutes).toBe(15);
    expect(summaries[0].timedRewardYen).toBe(1500);
  });

  it("承認済み除外申請で対象ログを集計から外す", () => {
    const baseSession = session();
    const effective = applyApprovedChangeRequests(
      [baseSession],
      [
        request({
          requestType: "exclude",
          targetSessionId: baseSession.id,
          requestedStartedAt: null,
          requestedEndedAt: null,
        }),
      ],
    );

    expect(effective[0].excludedAt).toBeInstanceOf(Date);
  });

  it("承認済み変更申請をreviewedAt順で安定適用する", () => {
    const baseSession = session({
      id: "00000000-0000-4000-8000-000000000001",
    });
    const earlierEdit = request({
      id: "00000000-0000-4000-8000-000000000002",
      requestType: "edit",
      targetSessionId: baseSession.id,
      requestedStartedAt: new Date("2026-06-10T01:05:00Z"),
      requestedEndedAt: new Date("2026-06-10T01:35:00Z"),
      reviewedAt: new Date("2026-06-11T00:00:00Z"),
      createdAt: new Date("2026-06-10T03:00:00Z"),
    });
    const laterEdit = request({
      id: "00000000-0000-4000-8000-000000000003",
      requestType: "edit",
      targetSessionId: baseSession.id,
      requestedStartedAt: new Date("2026-06-10T01:10:00Z"),
      requestedEndedAt: new Date("2026-06-10T01:50:00Z"),
      reviewedAt: new Date("2026-06-11T00:10:00Z"),
      createdAt: new Date("2026-06-10T03:05:00Z"),
    });

    const effective = applyApprovedChangeRequests(
      [baseSession],
      [laterEdit, earlierEdit],
    );

    expect(effective[0].startedAt).toEqual(new Date("2026-06-10T01:10:00Z"));
    expect(effective[0].endedAt).toEqual(new Date("2026-06-10T01:50:00Z"));
  });

  it("作業中の未close Project Issueをログなしでも未精算予定に出す", () => {
    const summaries = buildSettlementSummaries(
      "2026-07",
      [
        issue({
          state: "OPEN",
          closedAt: null,
          status: "In Progress",
          rewardMode: "固定",
        }),
      ],
      [],
      requests,
    );

    expect(summaries[0].assigneeLogin).toBe("koideshogo");
    expect(summaries[0].unsettledProjectIssues).toHaveLength(1);
    expect(summaries[0].unsettledProjectIssues[0].workMinutes).toBe(0);
    expect(summaries[0].unsettledProjectIssues[0].reason).toBe(
      "open_in_progress",
    );
    expect(summaries[0].approvalRequired).toBe(false);
  });

  it("closed済みでもStatusがDoneでないIssueをclose月の未精算予定に出す", () => {
    const summaries = buildSettlementSummaries(
      "2026-07",
      [
        issue({
          status: "In Progress",
          rewardMode: "固定",
        }),
      ],
      [],
      requests,
    );

    expect(summaries[0].assigneeLogin).toBe("koideshogo");
    expect(summaries[0].lines).toHaveLength(0);
    expect(summaries[0].unsettledProjectIssues).toHaveLength(1);
    expect(summaries[0].unsettledProjectIssues[0].reason).toBe(
      "closed_not_done",
    );
    expect(summaries[0].approvalRequired).toBe(false);
  });

  it("固定報酬の精算対象Issueは稼働ログなしでも承認対象にする", () => {
    const summaries = buildSettlementSummaries(
      "2026-07",
      [
        issue({
          rewardMode: "固定",
          hourlyRateYen: null,
        }),
      ],
      [],
      requests,
    );

    expect(summaries[0].lines).toHaveLength(1);
    expect(summaries[0].lines[0].workMinutes).toBe(0);
    expect(summaries[0].approvalRequired).toBe(true);
  });

  it("スナップショット比較は表示名変更を無視し、金額変更を検知する", () => {
    const [summary] = buildSettlementSummaries(
      "2026-07",
      [issue({ rewardMode: "固定" })],
      [],
      requests,
    );
    const snapshot = createSettlementSnapshotPayload(summary);
    const renamedSummary = {
      ...summary,
      lines: summary.lines.map((line) => ({
        ...line,
        issue: { ...line.issue, title: "rename only" },
      })),
    };
    const amountChangedSummary = {
      ...summary,
      fixedRewardYen: summary.fixedRewardYen + 1,
      taxExcludedYen: summary.taxExcludedYen + 1,
      taxIncludedYen: summary.taxIncludedYen + 1,
    };

    expect(hasSettlementSnapshotChanges(snapshot, renamedSummary)).toBe(false);
    expect(hasSettlementSnapshotChanges(snapshot, amountChangedSummary)).toBe(
      true,
    );
  });
});
