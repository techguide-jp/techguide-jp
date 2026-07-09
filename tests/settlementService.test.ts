import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuditLog } from "$lib/server/audit/auditRepository";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import type { ProjectIssue } from "$lib/server/github/projectTypes";
import { getPaymentRow } from "$lib/server/payments/paymentRepository";
import {
  approveSettlement,
  loadSettlementMonth,
  submitSettlementWork,
  validateSettlementPaymentEligibility,
} from "$lib/server/settlements/settlementService";
import { buildSettlementSummaries } from "$lib/server/settlements/settlementCalculator";
import { createSettlementSnapshotPayload } from "$lib/server/settlements/settlementSnapshot";
import {
  getSnapshot,
  listSnapshotsForMonth,
} from "$lib/server/settlements/snapshotRepository";
import { recordSettlementApproval } from "$lib/server/settlements/settlementApprovalRepository";
import {
  listWorkSubmissionsForMonth,
  upsertWorkSubmission,
} from "$lib/server/settlements/submissionRepository";
import {
  listChangeRequestsForSettlementContext,
  listWorkSessionsForSettlementContext,
  reviewChangeRequest,
} from "$lib/server/work/workRepository";

vi.mock("$lib/server/audit/auditRepository", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("$lib/server/github/projectClient", () => ({
  fetchProjectIssuesForPage: vi.fn(),
}));

vi.mock("$lib/server/payments/paymentRepository", () => ({
  getPaymentRow: vi.fn(),
}));

vi.mock("$lib/server/settlements/snapshotRepository", () => ({
  getSnapshot: vi.fn(),
  listSnapshotsForMonth: vi.fn(),
}));

vi.mock("$lib/server/settlements/settlementApprovalRepository", () => ({
  recordSettlementApproval: vi.fn(),
}));

vi.mock("$lib/server/settlements/submissionRepository", () => ({
  listWorkSubmissionsForMonth: vi.fn(),
  upsertWorkSubmission: vi.fn(),
}));

vi.mock("$lib/server/work/workRepository", () => ({
  listChangeRequestsForSettlementContext: vi.fn(),
  listWorkSessionsForSettlementContext: vi.fn(),
  reviewChangeRequest: vi.fn(),
}));

const projectFetchError =
  "GitHub Projectを取得できません。GITHUB_PROJECT_TOKEN にProject v2を読める権限がありません。";

const approvedIssue: ProjectIssue = {
  projectItemId: "item-1",
  repository: "techguide-jp/example",
  number: 1,
  title: "Issue",
  state: "CLOSED",
  url: "https://github.com/techguide-jp/example/issues/1",
  createdAt: "2026-06-01T00:00:00Z",
  closedAt: "2026-06-20T00:00:00Z",
  assignees: ["tashua314"],
  status: "Done",
  rewardMode: "固定",
  fixedRewardYen: 1000,
  extraCapYen: null,
  hourlyRateYen: null,
};

const mockSuccessfulProjectFetch = () => {
  vi.mocked(fetchProjectIssuesForPage).mockResolvedValue({
    health: {
      title: "外注管理",
      missingFields: [],
      invalidFields: [],
      availableFields: [],
    },
    issues: [approvedIssue],
    projectFetchError: null,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchProjectIssuesForPage).mockResolvedValue({
    health: {
      title: "外注管理",
      missingFields: ["Status"],
      invalidFields: [],
      availableFields: [],
    },
    issues: [],
    projectFetchError,
  });
  vi.mocked(listWorkSessionsForSettlementContext).mockResolvedValue([]);
  vi.mocked(listChangeRequestsForSettlementContext).mockResolvedValue([]);
  vi.mocked(listSnapshotsForMonth).mockResolvedValue([]);
  vi.mocked(listWorkSubmissionsForMonth).mockResolvedValue([]);
  vi.mocked(getSnapshot).mockResolvedValue(null);
  vi.mocked(getPaymentRow).mockResolvedValue(null);
  vi.mocked(recordSettlementApproval).mockResolvedValue(undefined);
  vi.mocked(upsertWorkSubmission).mockResolvedValue(
    {} as Awaited<ReturnType<typeof upsertWorkSubmission>>,
  );
  vi.mocked(reviewChangeRequest).mockResolvedValue(null);
  vi.mocked(createAuditLog).mockResolvedValue(
    {} as Awaited<ReturnType<typeof createAuditLog>>,
  );
});

describe("loadSettlementMonth", () => {
  it("GitHub Project取得失敗を500にせず画面データとして返す", async () => {
    const data = await loadSettlementMonth("2026-06");

    expect(data.projectFetchError).toBe(projectFetchError);
    expect(data.issues).toEqual([]);
    expect(data.summaries).toEqual([]);
    expect(listWorkSessionsForSettlementContext).toHaveBeenCalledOnce();
    expect(listSnapshotsForMonth).toHaveBeenCalledWith("2026-06");
  });
});

describe("monthly settlement actions", () => {
  it("Project取得失敗中の月次確定申請を明示エラーにする", async () => {
    const result = await submitSettlementWork(
      "2026-06",
      "tashua314",
      "tashua314",
    );

    expect(result).toEqual({
      ok: false,
      message: "GitHub Projectを取得できないため、精算額を確定できません。",
    });
    expect(upsertWorkSubmission).not.toHaveBeenCalled();
  });

  it("Project取得失敗中の月次承認を明示エラーにする", async () => {
    const result = await approveSettlement("2026-06", "tashua314", "admin");

    expect(result).toEqual({
      ok: false,
      message: "GitHub Projectを取得できないため、精算額を確定できません。",
    });
    expect(recordSettlementApproval).not.toHaveBeenCalled();
  });

  it("未承認の精算は支払い情報を更新できない", async () => {
    mockSuccessfulProjectFetch();

    const result = await validateSettlementPaymentEligibility(
      "2026-06",
      "tashua314",
    );

    expect(result).toEqual({
      ok: false,
      message: "未承認の月次精算は支払い情報を更新できません。",
    });
  });

  it("支払い済みの精算は再承認できない", async () => {
    mockSuccessfulProjectFetch();
    const summary = buildSettlementSummaries(
      "2026-06",
      [approvedIssue],
      [],
      [],
    )[0];
    const snapshot = createSettlementSnapshotPayload(summary);
    vi.mocked(listWorkSubmissionsForMonth).mockResolvedValue([
      {
        month: "2026-06",
        assigneeLogin: "tashua314",
        snapshot,
        submittedBy: "tashua314",
        submittedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ]);
    vi.mocked(getPaymentRow).mockResolvedValue({
      month: "2026-06",
      assigneeLogin: "tashua314",
      status: "paid",
      scheduledDate: null,
      paidOn: "2026-07-14",
      createdAt: new Date("2026-07-14T00:00:00Z"),
      updatedAt: new Date("2026-07-14T00:00:00Z"),
    });

    const result = await approveSettlement("2026-06", "tashua314", "admin");

    expect(result).toEqual({
      ok: false,
      message:
        "支払い済みの月次精算は再承認できません。先に支払い済み登録を取り消してください。",
    });
    expect(recordSettlementApproval).not.toHaveBeenCalled();
  });

  it("月次承認と同時に支払い予定日を保存する", async () => {
    mockSuccessfulProjectFetch();
    const summary = buildSettlementSummaries(
      "2026-06",
      [approvedIssue],
      [],
      [],
    )[0];
    const snapshot = createSettlementSnapshotPayload(summary);
    vi.mocked(listWorkSubmissionsForMonth).mockResolvedValue([
      {
        month: "2026-06",
        assigneeLogin: "tashua314",
        snapshot,
        submittedBy: "tashua314",
        submittedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ]);

    const result = await approveSettlement(
      "2026-06",
      "tashua314",
      "admin",
      "2026-07-20",
    );

    expect(result).toEqual({ ok: true });
    expect(recordSettlementApproval).toHaveBeenCalledWith({
      summary,
      approvedBy: "admin",
      scheduledDate: "2026-07-20",
    });
  });

  it("不正な支払い予定日は月次承認前に拒否する", async () => {
    const result = await approveSettlement(
      "2026-06",
      "tashua314",
      "admin",
      "2026-99-99",
    );

    expect(result).toEqual({
      ok: false,
      message: "支払い予定日はYYYY-MM-DD形式で入力してください。",
    });
    expect(fetchProjectIssuesForPage).not.toHaveBeenCalled();
    expect(recordSettlementApproval).not.toHaveBeenCalled();
  });
});
