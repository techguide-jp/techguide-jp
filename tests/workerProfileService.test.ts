import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerProfile } from "$lib/server/db/schema";
import {
  ensureWorkerProfile as ensureWorkerProfileRow,
  getWorkerProfile,
  upsertWorkerAdminNote,
  upsertWorkerSelfProfile,
} from "$lib/server/workers/workerProfileRepository";
import {
  ensureWorkerProfile,
  normalizeSkills,
  updateWorkerAdminNote,
  updateWorkerSelfProfile,
} from "$lib/server/workers/workerProfileService";

vi.mock("$lib/server/workers/workerProfileRepository", () => ({
  ensureWorkerProfile: vi.fn(),
  getWorkerProfile: vi.fn(),
  upsertWorkerAdminNote: vi.fn(),
  upsertWorkerSelfProfile: vi.fn(),
}));

const profile = (overrides: Partial<WorkerProfile> = {}): WorkerProfile => ({
  login: "tashua314",
  displayName: "たしゅあ",
  skills: ["SvelteKit"],
  specialtyNote: "",
  availabilityNote: "",
  selfAssignmentNote: "",
  adminNote: "",
  adminNoteUpdatedBy: null,
  adminNoteUpdatedAt: null,
  createdAt: new Date("2026-06-18T00:00:00Z"),
  updatedAt: new Date("2026-06-18T00:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureWorkerProfileRow).mockResolvedValue(undefined);
  vi.mocked(getWorkerProfile).mockResolvedValue(null);
  vi.mocked(upsertWorkerSelfProfile).mockResolvedValue(profile());
  vi.mocked(upsertWorkerAdminNote).mockResolvedValue(profile());
});

describe("workerProfileService", () => {
  it("ログイン時にGitHub名を初期表示名として作成する", async () => {
    await ensureWorkerProfile({ login: "tashua314", displayName: "Tashua" });

    expect(ensureWorkerProfileRow).toHaveBeenCalledWith({
      login: "tashua314",
      displayName: "Tashua",
    });
  });

  it("GitHub名が空ならloginを初期表示名にする", async () => {
    await ensureWorkerProfile({ login: "tashua314", displayName: "" });

    expect(ensureWorkerProfileRow).toHaveBeenCalledWith({
      login: "tashua314",
      displayName: "tashua314",
    });
  });

  it("スキルをtrimして重複を除く", () => {
    expect(
      normalizeSkills(" SvelteKit\nsveltekit,Drizzle\nTypeScript "),
    ).toEqual(["SvelteKit", "Drizzle", "TypeScript"]);
  });

  it("本人プロフィール更新を保存する", async () => {
    const data = new FormData();
    data.set("displayName", " たしゅあ ");
    data.set("skills", "SvelteKit\nDrizzle\nSvelteKit");
    data.set("specialtyNote", "管理画面");
    data.set("availabilityNote", "平日夜");
    data.set("selfAssignmentNote", "短期タスク優先");

    const result = await updateWorkerSelfProfile(
      data,
      "tashua314",
      "tashua314",
    );

    expect(result.ok).toBe(true);
    expect(upsertWorkerSelfProfile).toHaveBeenCalledWith({
      login: "tashua314",
      displayName: "たしゅあ",
      skills: ["SvelteKit", "Drizzle"],
      specialtyNote: "管理画面",
      availabilityNote: "平日夜",
      selfAssignmentNote: "短期タスク優先",
    });
  });

  it("本人以外のプロフィール更新を拒否する", async () => {
    const data = new FormData();
    data.set("displayName", "別の人");

    const result = await updateWorkerSelfProfile(data, "admin", "tashua314");

    expect(result.ok).toBe(false);
    expect(upsertWorkerSelfProfile).not.toHaveBeenCalled();
  });

  it("管理者メモを管理者だけが更新できる", async () => {
    vi.mocked(getWorkerProfile).mockResolvedValue(profile());
    const data = new FormData();
    data.set("adminNote", "ReactよりSvelteが得意");

    const result = await updateWorkerAdminNote(
      data,
      "admin",
      true,
      "tashua314",
    );

    expect(result.ok).toBe(true);
    expect(upsertWorkerAdminNote).toHaveBeenCalledWith({
      login: "tashua314",
      fallbackDisplayName: "たしゅあ",
      adminNote: "ReactよりSvelteが得意",
      adminNoteUpdatedBy: "admin",
    });
  });

  it("非管理者の管理者メモ更新を拒否する", async () => {
    const data = new FormData();
    data.set("adminNote", "memo");

    const result = await updateWorkerAdminNote(
      data,
      "tashua314",
      false,
      "tashua314",
    );

    expect(result.ok).toBe(false);
    expect(upsertWorkerAdminNote).not.toHaveBeenCalled();
  });
});
