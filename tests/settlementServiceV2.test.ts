import { beforeEach, describe, expect, it, vi } from "vitest";
import { settlementSnapshotV1 } from "./fixtures/settlementSnapshotV1";
import type {
  IssueCompletionReport,
  MonthlySettlementSnapshot,
  MonthlyWorkSubmission,
  SupplementalPayment,
  WorkLogChangeRequest,
  WorkSession,
} from "$lib/server/db/schema";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import {
  loadSettlementMonth,
  submitSettlementWork,
  approveSettlement,
  recreateSettlementNotice,
} from "$lib/server/settlements/settlementService";
import {
  createSettlementSnapshotPayload,
  hasSettlementSnapshotChanges,
  hasWorkSubmissionChanges,
} from "$lib/server/settlements/settlementSnapshot";
import { restoreSettlementSummary } from "$lib/server/settlements/settlementSnapshotRestore";
import { buildNoticeDocument } from "$lib/server/notices/noticeService";
import {
  dispatchPreparedNotification,
  prepareSettlementNotificationSafely,
} from "$lib/server/notifications/notificationService";
import {
  settlementAmountLabel,
  settlementSourceLabel,
} from "$lib/settlementDisplay";

const state = vi.hoisted(() => ({
  issues: [] as ProjectIssue[],
  sessions: [] as WorkSession[],
  requests: [] as WorkLogChangeRequest[],
  reports: [] as IssueCompletionReport[],
  snapshots: [] as MonthlySettlementSnapshot[],
  submissions: [] as MonthlyWorkSubmission[],
  supplemental: [] as SupplementalPayment[],
  frozenRates: new Map<string, number | null>(),
  sourceToken: "unchanged",
  projectError: null as string | null,
  fetch: vi.fn(),
  persistSubmission: vi.fn(),
  persistApproval: vi.fn(),
  prepareNotice: vi.fn(),
  insertNotice: vi.fn(),
}));
vi.mock("$lib/server/env", () => ({ env: { settlementRuleV2Enabled: true } }));
vi.mock("$lib/server/settlements/hourlyRateRepository", () => ({
  listFrozenHourlyRates: async () => new Map(state.frozenRates),
}));
vi.mock("$lib/server/settlements/settlementWriteGuard", () => ({
  readSettlementSourceToken: async () => state.sourceToken,
}));
vi.mock("$lib/server/audit/auditRepository", () => ({
  createAuditLog: vi.fn(),
}));
vi.mock("$lib/server/github/projectClient", () => ({
  fetchProjectIssuesForPage: async () => {
    state.fetch();
    return {
      issues: state.projectError ? [] : state.issues,
      health: null,
      projectFetchError: state.projectError,
    };
  },
}));
vi.mock("$lib/server/work/workRepository", () => ({
  listWorkSessionsForSettlementContext: async () => state.sessions,
  listChangeRequestsForSettlementContext: async () => state.requests,
  listWorkSessions: async () => state.sessions,
  listChangeRequests: async () => state.requests,
  reviewChangeRequest: vi.fn(),
  reviewChangeRequestAndInvalidateCompletion: vi.fn(),
}));
vi.mock("$lib/server/settlements/snapshotRepository", () => ({
  getSnapshot: async (month: string, login: string) =>
    state.snapshots.find(
      (s) => s.month === month && s.assigneeLogin === login,
    ) ?? null,
  listSnapshots: async () => state.snapshots,
  listSnapshotsForMonth: async (month: string) =>
    state.snapshots.filter((s) => s.month === month),
}));
vi.mock("$lib/server/settlements/submissionRepository", () => ({
  listWorkSubmissions: async () => state.submissions,
  listWorkSubmissionsForMonth: async (month: string) =>
    state.submissions.filter((s) => s.month === month),
  upsertWorkSubmission: state.persistSubmission,
}));
vi.mock("$lib/server/payments/paymentRepository", () => ({
  getPaymentRow: async () => null,
}));
vi.mock("$lib/server/notices/noticeService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("$lib/server/notices/noticeService")
  >()),
  prepareNoticeWriteInput: state.prepareNotice,
}));
vi.mock("$lib/server/notices/noticeRepository", () => ({
  insertPaymentNotice: state.insertNotice,
}));
vi.mock("$lib/server/settlements/settlementApprovalRepository", () => ({
  recordSettlementApproval: state.persistApproval,
}));
vi.mock("$lib/server/notifications/notificationService", () => ({
  dispatchPreparedNotification: vi.fn(),
  prepareSettlementNotificationSafely: vi.fn(),
}));
vi.mock("$lib/server/completions/completionService", () => ({
  reconcileCompletionReports: vi.fn(),
}));
vi.mock("$lib/server/completions/completionRepository", () => ({
  listActiveCompletionReports: async () =>
    state.reports.filter((r) => !r.invalidatedAt),
  listCompletionReportsForMonth: async (month: string) =>
    state.reports.filter((r) => r.settlementMonth === month),
  listSupplementalPaymentsForMonth: async () => state.supplemental,
}));

const session = (
  month: string,
  overrides: Partial<WorkSession> = {},
): WorkSession => ({
  id: `session-${month}`,
  assigneeLogin: "worker",
  repository: "example/repo",
  issueNumber: 1,
  issueTitle: "保存時の件名",
  startedAt: new Date(`${month}-20T00:00:00Z`),
  endedAt: new Date(`${month}-20T01:00:00Z`),
  createdBy: "worker",
  createdAt: new Date(`${month}-20T00:00:00Z`),
  updatedAt: new Date(`${month}-20T01:00:00Z`),
  excludedAt: null,
  excludeReason: null,
  ...overrides,
});
const pendingReport = (): IssueCompletionReport => ({
  id: "report-1",
  repository: "example/repo",
  issueNumber: 1,
  assigneeLogin: "worker",
  settlementMonth: "2026-08",
  issueTitle: "保存時の件名",
  issueUrl: "https://github.com/example/repo/issues/1",
  projectItemId: "item-1",
  reportedAt: new Date("2026-08-31T00:00:00Z"),
  rewardMode: "ハイブリッド",
  fixedRewardYen: 50000,
  source: "worker",
  evidenceUrl: null,
  evidenceNote: null,
  invalidatedAt: null,
  invalidatedBy: null,
  invalidationReason: null,
  eligibilityConfirmedAt: null,
  createdAt: new Date("2026-08-31T00:00:00Z"),
  createdBy: "worker",
});
const saved = async (month = "2026-08") => {
  const data = await loadSettlementMonth(month);
  const summary = data.summaries.find((s) => s.assigneeLogin === "worker")!;
  const snapshot = JSON.parse(
    JSON.stringify(createSettlementSnapshotPayload(summary)),
  );
  return { summary, snapshot };
};
const approveSaved = async () => {
  const { summary, snapshot } = await saved();
  state.snapshots = [
    {
      month: "2026-08",
      assigneeLogin: "worker",
      snapshot,
      approvedBy: "admin",
      approvedAt: new Date("2026-09-03T00:00:00Z"),
    },
  ];
  return summary;
};

beforeEach(() => {
  vi.clearAllMocks();
  state.issues = [
    {
      projectItemId: "item-1",
      repository: "example/repo",
      number: 1,
      title: "保存時の件名",
      url: "https://github.com/example/repo/issues/1",
      createdAt: "2026-08-01T00:00:00Z",
      state: "OPEN",
      closedAt: null,
      status: "In Progress",
      assignees: ["worker"],
      rewardMode: "ハイブリッド",
      fixedRewardYen: 50000,
      hourlyRateYen: 6000,
      extraCapYen: 10000,
    },
  ];
  state.sessions = [session("2026-08")];
  state.requests = [];
  state.reports = [];
  state.snapshots = [];
  state.submissions = [];
  state.supplemental = [];
  state.projectError = null;
  state.frozenRates = new Map();
  state.sourceToken = "unchanged";
  state.prepareNotice.mockResolvedValue({ ok: true, notice: { id: "notice" } });
  vi.mocked(prepareSettlementNotificationSafely).mockResolvedValue({
    mode: "preview",
    entries: [],
  });
});

describe("V2 月次処理の回帰", () => {
  it("申請明細からIssueを除外しても永続保存した本人の単価を維持する", async () => {
    state.frozenRates.set("example/repo#1#worker", 6000);
    state.issues[0].hourlyRateYen = 9000;
    state.sessions = [session("2026-09")];
    expect((await saved("2026-09")).summary.timedRewardYen).toBe(6000);
    state.sessions[0].assigneeLogin = "replacement";
    const data = await loadSettlementMonth("2026-09");
    expect(
      data.summaries.find((s) => s.assigneeLogin === "replacement")
        ?.timedRewardYen,
    ).toBe(9000);
  });

  it("計算開始時の版でDBが承認を拒否した場合は成功通知を出さない", async () => {
    const { snapshot } = await saved();
    state.submissions = [
      {
        month: "2026-08",
        assigneeLogin: "worker",
        snapshot,
        submittedBy: "worker",
        submittedAt: new Date(),
      },
    ];
    state.prepareNotice.mockImplementationOnce(async () => {
      state.sourceToken = "changed-during-notice-preparation";
      return { ok: true, notice: { id: "notice" } };
    });
    state.persistApproval.mockResolvedValueOnce(false);
    const result = await approveSettlement("2026-08", "worker", "admin");
    expect(result.ok).toBe(false);
    expect(state.persistApproval.mock.calls[0][0].expectedSourceToken).toBe(
      "unchanged",
    );
    expect(dispatchPreparedNotification).not.toHaveBeenCalled();
  });

  it("申請の競合時も古い単価・申請を保存せず成功通知を出さない", async () => {
    state.persistSubmission.mockResolvedValueOnce(false);
    expect((await submitSettlementWork("2026-08", "worker", "worker")).ok).toBe(
      false,
    );
    expect(state.persistSubmission.mock.calls[0][2].expectedSourceToken).toBe(
      "unchanged",
    );
    expect(dispatchPreparedNotification).not.toHaveBeenCalled();
  });

  it.each([
    "minutes",
    "session",
    "issue",
    "title",
    "url",
    "comparable",
    "hash",
    "sourceHash",
  ])(
    "保存原本の%sが壊れた場合は金額が同じでも通知書を作らない",
    async (field) => {
      await approveSaved();
      const payload = state.snapshots[0].snapshot as ReturnType<
        typeof createSettlementSnapshotPayload
      >;
      if (field === "minutes") payload.source.lines[0].workMinutes = 9999;
      if (field === "session")
        payload.source.lines[0].sessions[0].startedAt = new Date(
          "2026-08-01T00:00:00Z",
        );
      if (field === "issue") payload.source.lines[0].issue.number = 999;
      if (field === "title") payload.source.lines[0].issue.title = "破損";
      if (field === "url")
        payload.source.lines[0].issue.url = "https://example.com/wrong";
      if (field === "comparable") payload.comparable = {};
      if (field === "hash") payload.hash = "wrong";
      if (field === "sourceHash") payload.sourceHash = "wrong";
      expect(restoreSettlementSummary(payload)).toBeNull();
      expect(
        (await recreateSettlementNotice("2026-08", "worker", "admin")).ok,
      ).toBe(false);
      expect(state.prepareNotice).not.toHaveBeenCalled();
      state.projectError = "GitHub error";
      expect(
        (await loadSettlementMonth("2026-08")).summaries[0].dataSource,
      ).toBe("unavailable");
    },
  );

  it("jsonbのキー並べ替えとv3互換を保ち、v3原本の分数破損を拒否する", async () => {
    const { snapshot } = await saved();
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, entry]) => [key, reorder(entry)]),
            )
          : value;
    expect(restoreSettlementSummary(reorder(snapshot))?.timedRewardYen).toBe(
      6000,
    );
    snapshot.schemaVersion = 3;
    delete snapshot.sourceHash;
    expect(restoreSettlementSummary(snapshot)?.timedRewardYen).toBe(6000);
    snapshot.source.lines[0].workMinutes = 9999;
    expect(restoreSettlementSummary(snapshot)).toBeNull();
  });
  it("未申請の8月6000円＋9月6000円で1万円上限を超えたら両月の申請・承認を止める", async () => {
    state.sessions.push(session("2026-09"));
    for (const month of ["2026-08", "2026-09"]) {
      const { summary, snapshot } = await saved(month);
      expect(summary.timedRewardYen).toBe(6000);
      expect(summary.blockingReasons).toContain(
        "example/repo#1: Issue全期間の時間精算額が追加精算上限を超えています。",
      );
      expect((await submitSettlementWork(month, "worker", "worker")).ok).toBe(
        false,
      );
      state.submissions.push({
        month,
        assigneeLogin: "worker",
        snapshot,
        submittedBy: "worker",
        submittedAt: new Date(),
      });
      expect((await approveSettlement(month, "worker", "admin")).ok).toBe(
        false,
      );
    }
    expect(state.persistSubmission).not.toHaveBeenCalled();
    expect(state.persistApproval).not.toHaveBeenCalled();
  });

  it("承認済みの過去月はログ変更後も確定額を一度だけ累計する", async () => {
    await approveSaved();
    state.sessions[0].excludedAt = new Date();
    state.sessions.push(session("2026-09"));
    const { summary } = await saved("2026-09");
    expect(summary.blockingReasons).toContain(
      "example/repo#1: Issue全期間の時間精算額が追加精算上限を超えています。",
    );
    state.sessions[0].excludedAt = null;
    state.issues[0].extraCapYen = 12000;
    expect((await saved("2026-09")).summary.blockingReasons).toEqual([]);
  });

  it("現在の方式が固定でも、完了報告に保存した時間報酬を上限から漏らさない", async () => {
    await approveSaved();
    state.sessions.push(session("2026-09"));
    state.reports = [
      {
        ...pendingReport(),
        settlementMonth: "2026-09",
        eligibilityConfirmedAt: new Date("2026-09-21T00:00:00Z"),
      },
    ];
    state.issues[0].rewardMode = "固定";
    const { summary } = await saved("2026-09");
    expect(summary.timedRewardYen).toBe(6000);
    expect(summary.blockingReasons).toContain(
      "example/repo#1: Issue全期間の時間精算額が追加精算上限を超えています。",
    );
  });

  it("完了報告の固定方式で時間報酬がない月を上限へ加算しない", async () => {
    state.sessions.push(session("2026-09"));
    state.reports = [
      {
        ...pendingReport(),
        rewardMode: "固定",
        eligibilityConfirmedAt: new Date("2026-09-01T00:00:00Z"),
      },
    ];
    expect((await saved()).summary.timedRewardYen).toBe(0);
    expect((await saved("2026-09")).summary.blockingReasons).toEqual([]);
  });

  it("未申請の別作業者の過去月も累計し、申請済み単価を維持する", async () => {
    const { snapshot } = await saved();
    state.submissions = [
      {
        month: "2026-08",
        assigneeLogin: "worker",
        snapshot,
        submittedBy: "worker",
        submittedAt: new Date(),
      },
    ];
    state.sessions.push(session("2026-09", { assigneeLogin: "replacement" }));
    state.issues[0] = {
      ...state.issues[0],
      assignees: ["replacement"],
      hourlyRateYen: 5000,
    };
    const data = await loadSettlementMonth("2026-09");
    const summary = data.summaries.find(
      (s) => s.assigneeLogin === "replacement",
    )!;
    expect(summary.timedRewardYen).toBe(5000);
    expect(summary.blockingReasons).toContain(
      "example/repo#1: Issue全期間の時間精算額が追加精算上限を超えています。",
    );
  });

  it("月またぎを分割し、承認済み月と未申請月を二重計上しない", async () => {
    state.sessions = [
      session("2026-08", {
        startedAt: new Date("2026-08-31T14:30:00Z"),
        endedAt: new Date("2026-08-31T15:30:00Z"),
      }),
    ];
    state.issues[0].extraCapYen = 6000;
    await approveSaved();
    const { summary } = await saved("2026-09");
    expect(summary.timedRewardYen).toBe(3000);
    expect(summary.blockingReasons).toEqual([]);
    state.issues[0].extraCapYen = 5999;
    expect((await saved("2026-09")).summary.blockingReasons).not.toEqual([]);
  });

  it("承認済みの除外修正を未申請過去月の累計へ反映する", async () => {
    state.sessions.push(session("2026-09"));
    state.requests = [
      {
        id: "exclude",
        assigneeLogin: "worker",
        repository: "example/repo",
        issueNumber: 1,
        issueTitle: "保存時の件名",
        requestType: "exclude",
        targetSessionId: "session-2026-08",
        requestedStartedAt: null,
        requestedEndedAt: null,
        reason: "重複",
        status: "approved",
        requestedBy: "worker",
        reviewedBy: "admin",
        reviewNote: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
        reviewedAt: new Date("2026-09-02T00:00:00Z"),
      },
    ];
    expect((await saved("2026-09")).summary.blockingReasons).toEqual([]);
    state.requests[0].status = "pending";
    expect((await saved("2026-09")).summary.blockingReasons).toContain(
      "example/repo#1: Issue全期間の時間精算額が追加精算上限を超えています。",
    );
  });

  it("完了待ちで承認した通常通知書を、Issue完了後も承認内容から再作成する", async () => {
    state.reports = [pendingReport()];
    const approved = await approveSaved();
    state.issues[0] = {
      ...state.issues[0],
      title: "変更後の件名",
      state: "CLOSED",
      status: "Done",
      closedAt: "2026-09-10T00:00:00Z",
      hourlyRateYen: 9000,
    };
    state.reports[0].eligibilityConfirmedAt = new Date("2026-09-10T00:00:00Z");
    state.projectError = "GitHub error";
    state.fetch.mockClear();
    expect(
      await recreateSettlementNotice("2026-08", "worker", "admin"),
    ).toEqual({ ok: true });
    const input = state.prepareNotice.mock.calls[0][0];
    expect(buildNoticeDocument(input.summary)).toEqual(
      buildNoticeDocument(approved),
    );
    expect(input.approvedAt).toBe("2026-09-03T00:00:00.000Z");
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.insertNotice).toHaveBeenCalledOnce();
  });

  it("壊れた承認済み金額では通知書を再作成しない", async () => {
    await approveSaved();
    const snapshot = state.snapshots[0].snapshot as {
      totals: { taxExcludedYen: number };
    };
    snapshot.totals.taxExcludedYen = 1;
    expect(
      (await recreateSettlementNotice("2026-08", "worker", "admin")).ok,
    ).toBe(false);
    expect(state.prepareNotice).not.toHaveBeenCalled();
  });

  it("v1の承認済み明細から通知書を再作成し、GitHub障害時にも保存結果を表示する", async () => {
    await approveSaved();
    state.snapshots[0].snapshot = structuredClone(settlementSnapshotV1);
    expect(
      await recreateSettlementNotice("2026-08", "worker", "admin"),
    ).toEqual({ ok: true });
    expect(state.prepareNotice.mock.calls[0][0].summary.taxIncludedYen).toBe(
      6600,
    );
    expect(state.insertNotice).toHaveBeenCalledOnce();
    state.projectError = "GitHub error";
    expect((await loadSettlementMonth("2026-08")).summaries[0]).toMatchObject({
      dataSource: "approved",
      taxIncludedYen: 6600,
    });
  });

  it("v1の明細と集計額が整合していてもハッシュ不一致なら通知書・保存結果を使わない", async () => {
    await approveSaved();
    const snapshot = structuredClone(settlementSnapshotV1);
    snapshot.comparable.lines[0].timedRewardYen = 12000;
    snapshot.comparable.lines[0].taxExcludedYen = 12000;
    snapshot.comparable.timedRewardYen = snapshot.totals.timedRewardYen = 12000;
    snapshot.comparable.taxExcludedYen = snapshot.totals.taxExcludedYen = 12000;
    snapshot.comparable.taxYen = snapshot.totals.taxYen = 1200;
    snapshot.comparable.taxIncludedYen = snapshot.totals.taxIncludedYen = 13200;
    state.snapshots[0].snapshot = snapshot;
    expect(
      (await recreateSettlementNotice("2026-08", "worker", "admin")).ok,
    ).toBe(false);
    expect(state.prepareNotice).not.toHaveBeenCalled();
    expect(state.insertNotice).not.toHaveBeenCalled();
    state.projectError = "GitHub error";
    expect((await loadSettlementMonth("2026-08")).summaries[0].dataSource).toBe(
      "unavailable",
    );
  });

  it("GitHub取得失敗でもログがない作業者の承認済み結果を表示する", async () => {
    await approveSaved();
    state.sessions = [];
    state.projectError = "GitHub error";
    const data = await loadSettlementMonth("2026-08");
    expect(data.summaries[0]).toMatchObject({
      dataSource: "approved",
      timedRewardYen: 6000,
      taxIncludedYen: 6600,
    });
    expect(data.snapshots[0].hasChanges).toBeNull();
    expect(settlementSourceLabel(data.summaries[0])).toContain("承認時点");
  });

  it("未承認なら申請時点の結果を保持し、障害復旧後は現在計算へ戻す", async () => {
    const { snapshot } = await saved();
    state.submissions = [
      {
        month: "2026-08",
        assigneeLogin: "worker",
        snapshot,
        submittedBy: "worker",
        submittedAt: new Date(),
      },
    ];
    state.projectError = "GitHub error";
    const failed = await loadSettlementMonth("2026-08");
    expect(failed.summaries[0]).toMatchObject({
      dataSource: "submitted",
      timedRewardYen: 6000,
    });
    expect(failed.submissions[0].hasChanges).toBeNull();
    expect((await submitSettlementWork("2026-08", "worker", "worker")).ok).toBe(
      false,
    );
    expect((await approveSettlement("2026-08", "worker", "admin")).ok).toBe(
      false,
    );
    state.projectError = null;
    expect(
      (await loadSettlementMonth("2026-08")).summaries[0].dataSource,
    ).toBeUndefined();
  });

  it("保存金額を表示する間もDBの未処理修正申請を隠さない", async () => {
    await approveSaved();
    state.requests = [
      {
        id: "pending-request",
        assigneeLogin: "worker",
        repository: "example/repo",
        issueNumber: 1,
        issueTitle: "保存時の件名",
        requestType: "exclude",
        targetSessionId: "session-2026-08",
        requestedStartedAt: null,
        requestedEndedAt: null,
        reason: "重複",
        status: "pending",
        requestedBy: "worker",
        reviewedBy: null,
        reviewNote: null,
        createdAt: new Date("2026-08-31T00:00:00Z"),
        reviewedAt: null,
      },
    ];
    state.projectError = "GitHub error";
    const data = await loadSettlementMonth("2026-08");
    expect(data.summaries[0].timedRewardYen).toBe(6000);
    expect(data.summaries[0].pendingRequests).toEqual(state.requests);
  });

  it("保存結果がない場合は金額と差分を0円扱いにしない", async () => {
    state.projectError = "GitHub error";
    const data = await loadSettlementMonth("2026-08");
    expect(data.summaries[0].dataSource).toBe("unavailable");
    expect(settlementAmountLabel(data.summaries[0], "taxIncludedYen")).toBe(
      "確認できません",
    );
  });

  it("旧版の比較用スナップショットも復元し、旧完了待ちキーで再申請扱いにしない", async () => {
    state.reports = [pendingReport()];
    const { summary, snapshot } = await saved();
    delete snapshot.source;
    delete snapshot.sourceHash;
    snapshot.schemaVersion = 2;
    snapshot.comparable.unsettledProjectIssues[0].reason = "merge_waiting";
    const restored = restoreSettlementSummary(snapshot)!;
    expect(restored.taxExcludedYen).toBe(6000);
    expect(restored.lines[0].issue.title).toContain("保存時の件名なし");
    expect(hasSettlementSnapshotChanges(snapshot, summary)).toBe(false);
    expect(hasWorkSubmissionChanges(snapshot, summary)).toBe(false);
  });
});
