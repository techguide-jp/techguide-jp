import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuditLog } from "$lib/server/audit/auditRepository";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import {
  approveSettlement,
  loadSettlementMonth,
  submitSettlementWork,
} from "$lib/server/settlements/settlementService";
import {
  getSnapshot,
  listSnapshotsForMonth,
  upsertSnapshot,
} from "$lib/server/settlements/snapshotRepository";
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

vi.mock("$lib/server/settlements/snapshotRepository", () => ({
  getSnapshot: vi.fn(),
  listSnapshotsForMonth: vi.fn(),
  upsertSnapshot: vi.fn(),
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
  vi.mocked(upsertWorkSubmission).mockResolvedValue(
    {} as Awaited<ReturnType<typeof upsertWorkSubmission>>,
  );
  vi.mocked(upsertSnapshot).mockResolvedValue(
    {} as Awaited<ReturnType<typeof upsertSnapshot>>,
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
    expect(upsertSnapshot).not.toHaveBeenCalled();
  });
});
