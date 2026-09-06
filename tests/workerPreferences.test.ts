import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPreferencesForViewer,
  updateOwnPreferences,
} from "$lib/server/workers/workerPreferencesService";
import { getWorkerProfile } from "$lib/server/workers/workerProfileRepository";
import { saveWorkerPreferences } from "$lib/server/workers/workerPreferencesRepository";
import type { WorkerPreferencesInput } from "$lib/workerPreferences";
vi.mock("$lib/server/workers/workerProfileRepository", () => ({
  getWorkerProfile: vi.fn(),
}));
vi.mock("$lib/server/workers/workerPreferencesRepository", () => ({
  saveWorkerPreferences: vi.fn(),
}));
const input: WorkerPreferencesInput = {
  availabilityNote: "平日夜",
  selfAssignmentNote: "開発",
  partnerInterest: "conditional",
  partnerConditions: "リモート",
  version: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveWorkerPreferences).mockResolvedValue(true);
});
describe("現在の希望", () => {
  it("既存プロフィールを初期値にし、参画意向を勝手に埋めない", async () => {
    vi.mocked(getWorkerProfile).mockResolvedValue({
      login: "worker",
      displayName: "作業者",
      skills: [],
      slackMemberId: "",
      specialtyNote: "",
      availabilityNote: "既存の稼働目安",
      selfAssignmentNote: "既存の希望",
      partnerInterest: null,
      partnerConditions: "",
      preferencesVersion: 0,
      preferencesUpdatedAt: null,
      adminNote: "非公開",
      adminNoteUpdatedAt: null,
      adminNoteUpdatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await loadPreferencesForViewer("worker", {
      login: "worker",
      isAdmin: false,
    });
    expect(result).toMatchObject({
      availabilityNote: "既存の稼働目安",
      selfAssignmentNote: "既存の希望",
      partnerInterest: "",
    });
    expect(result).not.toHaveProperty("adminNote");
  });
  it("第三者には希望を読み取らず、管理者も本人の代わりに更新できない", async () => {
    expect(
      await loadPreferencesForViewer("worker", {
        login: "other",
        isAdmin: false,
      }),
    ).toBeNull();
    expect(getWorkerProfile).not.toHaveBeenCalled();
    expect((await updateOwnPreferences("worker", "admin", input)).ok).toBe(
      false,
    );
    expect(saveWorkerPreferences).not.toHaveBeenCalled();
  });
  it.each(["", "unknown"])("参画希望 %s を拒否する", async (interest) => {
    expect(
      (
        await updateOwnPreferences("worker", "worker", {
          ...input,
          partnerInterest:
            interest as WorkerPreferencesInput["partnerInterest"],
        })
      ).ok,
    ).toBe(false);
    expect(saveWorkerPreferences).not.toHaveBeenCalled();
  });
  it("希望しないへの変更は案件条件を消去する", async () => {
    expect(
      (
        await updateOwnPreferences("worker", "worker", {
          ...input,
          partnerInterest: "not_interested",
        })
      ).ok,
    ).toBe(true);
    expect(saveWorkerPreferences).toHaveBeenCalledWith(
      "worker",
      expect.objectContaining({ partnerConditions: "" }),
    );
  });
  it("上限超過と古い版を成功扱いにしない", async () => {
    expect(
      (
        await updateOwnPreferences("worker", "worker", {
          ...input,
          availabilityNote: "あ".repeat(2001),
        })
      ).ok,
    ).toBe(false);
    expect(saveWorkerPreferences).not.toHaveBeenCalled();
    vi.mocked(saveWorkerPreferences).mockResolvedValue(false);
    expect((await updateOwnPreferences("worker", "worker", input)).ok).toBe(
      false,
    );
  });
});
