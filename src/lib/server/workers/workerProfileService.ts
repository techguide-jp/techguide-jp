import { z } from "zod";
import type { WorkerProfile } from "$lib/server/db/schema";
import {
  ensureWorkerProfile as ensureWorkerProfileRow,
  getWorkerProfile,
  upsertWorkerAdminNote,
  upsertWorkerSelfProfile,
} from "$lib/server/workers/workerProfileRepository";

export type WorkerProfileView = {
  login: string;
  displayName: string;
  skills: string[];
  specialtyNote: string;
  availabilityNote: string;
  selfAssignmentNote: string;
  adminNote: string;
  adminNoteUpdatedBy: string | null;
  adminNoteUpdatedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  exists: boolean;
};

const selfProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  skills: z.string().max(2000).optional(),
  specialtyNote: z.string().trim().max(2000).optional(),
  availabilityNote: z.string().trim().max(2000).optional(),
  selfAssignmentNote: z.string().trim().max(2000).optional(),
});

const adminNoteSchema = z.object({
  adminNote: z.string().trim().max(2000),
});

const normalizeDisplayName = (
  displayName: string | null | undefined,
  login: string,
): string => {
  const normalized = displayName?.trim();
  return normalized ? normalized.slice(0, 100) : login;
};

export const normalizeSkills = (
  value: string | string[] | null | undefined,
): string[] => {
  const rawItems = Array.isArray(value)
    ? value
    : (value ?? "").split(/[\n,]/).map((item) => item.trim());
  const skills: string[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    const skill = item.trim();
    const key = skill.toLocaleLowerCase();
    if (!skill || seen.has(key)) continue;
    seen.add(key);
    skills.push(skill.slice(0, 60));
  }

  return skills.slice(0, 30);
};

export const toWorkerProfileView = (
  login: string,
  profile: WorkerProfile | null,
): WorkerProfileView => ({
  login,
  displayName: profile?.displayName ?? login,
  skills: normalizeSkills(profile?.skills ?? []),
  specialtyNote: profile?.specialtyNote ?? "",
  availabilityNote: profile?.availabilityNote ?? "",
  selfAssignmentNote: profile?.selfAssignmentNote ?? "",
  adminNote: profile?.adminNote ?? "",
  adminNoteUpdatedBy: profile?.adminNoteUpdatedBy ?? null,
  adminNoteUpdatedAt: profile?.adminNoteUpdatedAt ?? null,
  createdAt: profile?.createdAt ?? null,
  updatedAt: profile?.updatedAt ?? null,
  exists: Boolean(profile),
});

export const ensureWorkerProfile = async (input: {
  login: string;
  displayName: string | null;
}): Promise<void> => {
  await ensureWorkerProfileRow({
    login: input.login,
    displayName: normalizeDisplayName(input.displayName, input.login),
  });
};

export const loadWorkerProfile = async (
  login: string,
): Promise<WorkerProfileView> => {
  return toWorkerProfileView(login, await getWorkerProfile(login));
};

export const updateWorkerSelfProfile = async (
  formData: FormData,
  actorLogin: string,
  targetLogin: string,
): Promise<
  { ok: true; profile: WorkerProfileView } | { ok: false; message: string }
> => {
  if (actorLogin !== targetLogin) {
    return { ok: false, message: "本人以外のプロフィールは編集できません。" };
  }

  const parsed = selfProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "プロフィールの入力内容を確認してください。" };
  }

  const profile = await upsertWorkerSelfProfile({
    login: targetLogin,
    displayName: parsed.data.displayName,
    skills: normalizeSkills(parsed.data.skills),
    specialtyNote: parsed.data.specialtyNote ?? "",
    availabilityNote: parsed.data.availabilityNote ?? "",
    selfAssignmentNote: parsed.data.selfAssignmentNote ?? "",
  });

  return { ok: true, profile: toWorkerProfileView(targetLogin, profile) };
};

export const updateWorkerAdminNote = async (
  formData: FormData,
  actorLogin: string,
  actorIsAdmin: boolean,
  targetLogin: string,
): Promise<
  { ok: true; profile: WorkerProfileView } | { ok: false; message: string }
> => {
  if (!actorIsAdmin) {
    return { ok: false, message: "管理者メモは管理者のみ編集できます。" };
  }

  const parsed = adminNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "管理者メモの入力内容を確認してください。" };
  }

  const current = await getWorkerProfile(targetLogin);
  const profile = await upsertWorkerAdminNote({
    login: targetLogin,
    fallbackDisplayName: current?.displayName ?? targetLogin,
    adminNote: parsed.data.adminNote,
    adminNoteUpdatedBy: actorLogin,
  });

  return { ok: true, profile: toWorkerProfileView(targetLogin, profile) };
};
