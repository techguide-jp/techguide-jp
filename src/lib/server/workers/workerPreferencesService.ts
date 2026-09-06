import { z } from "zod";
import type {
  WorkerPreferencesInput,
  WorkerPreferencesView,
} from "$lib/workerPreferences";
import { getWorkerProfile } from "$lib/server/workers/workerProfileRepository";
import { saveWorkerPreferences } from "$lib/server/workers/workerPreferencesRepository";

const inputSchema = z.object({
  availabilityNote: z
    .string()
    .max(2000)
    .transform((value) => value.trim()),
  selfAssignmentNote: z
    .string()
    .max(2000)
    .transform((value) => value.trim()),
  partnerInterest: z.enum(["interested", "conditional", "not_interested"]),
  partnerConditions: z
    .string()
    .max(2000)
    .transform((value) => value.trim()),
  version: z.number().int().nonnegative(),
});
type Viewer = { login: string; isAdmin: boolean };
export const loadPreferencesForViewer = async (
  login: string,
  viewer: Viewer,
): Promise<WorkerPreferencesView | null> => {
  if (viewer.login !== login && !viewer.isAdmin) return null;
  const profile = await getWorkerProfile(login);
  return {
    availabilityNote: profile?.availabilityNote ?? "",
    selfAssignmentNote: profile?.selfAssignmentNote ?? "",
    partnerInterest: profile?.partnerInterest ?? "",
    partnerConditions: profile?.partnerConditions ?? "",
    version: profile?.preferencesVersion ?? 0,
    updatedAt: profile?.preferencesUpdatedAt ?? profile?.updatedAt ?? null,
  };
};

export const updateOwnPreferences = async (
  login: string,
  actorLogin: string,
  input: WorkerPreferencesInput,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (login !== actorLogin)
    return { ok: false, message: "本人以外の希望は更新できません。" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: "参画希望を選択し、各項目を2,000文字以内で入力してください。",
    };
  const saved = await saveWorkerPreferences(login, {
    ...parsed.data,
    // 希望しないに変えた後、古い案件条件を運営が現行の希望として使わないよう消去する。
    partnerConditions:
      parsed.data.partnerInterest === "not_interested"
        ? ""
        : parsed.data.partnerConditions,
  });
  return saved
    ? { ok: true }
    : {
        ok: false,
        message:
          "別の画面で希望が更新されています。入力内容を控え、再読み込みして最新の希望を確認してください。",
      };
};
