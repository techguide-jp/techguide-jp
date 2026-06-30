import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { workerProfiles, type WorkerProfile } from "$lib/server/db/schema";

export const getWorkerProfile = async (
  login: string,
): Promise<WorkerProfile | null> => {
  const [profile] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.login, login))
    .limit(1);
  return profile ?? null;
};

export const listWorkerProfiles = async (
  logins: string[],
): Promise<WorkerProfile[]> => {
  const uniqueLogins = [...new Set(logins)].filter(Boolean);
  if (uniqueLogins.length === 0) return [];

  return db
    .select()
    .from(workerProfiles)
    .where(inArray(workerProfiles.login, uniqueLogins));
};

export const listAllWorkerProfiles = async (): Promise<WorkerProfile[]> => {
  return db.select().from(workerProfiles);
};

export const ensureWorkerProfile = async (input: {
  login: string;
  displayName: string;
}): Promise<void> => {
  await db
    .insert(workerProfiles)
    .values({
      login: input.login,
      displayName: input.displayName,
    })
    .onConflictDoNothing();
};

export const upsertWorkerSelfProfile = async (input: {
  login: string;
  displayName: string;
  skills: string[];
  specialtyNote: string;
  availabilityNote: string;
  selfAssignmentNote: string;
}): Promise<WorkerProfile> => {
  const [profile] = await db
    .insert(workerProfiles)
    .values({
      login: input.login,
      displayName: input.displayName,
      skills: input.skills,
      specialtyNote: input.specialtyNote,
      availabilityNote: input.availabilityNote,
      selfAssignmentNote: input.selfAssignmentNote,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workerProfiles.login,
      set: {
        displayName: input.displayName,
        skills: input.skills,
        specialtyNote: input.specialtyNote,
        availabilityNote: input.availabilityNote,
        selfAssignmentNote: input.selfAssignmentNote,
        updatedAt: new Date(),
      },
    })
    .returning();
  return profile;
};

export const upsertWorkerAdminNote = async (input: {
  login: string;
  fallbackDisplayName: string;
  adminNote: string;
  adminNoteUpdatedBy: string;
}): Promise<WorkerProfile> => {
  const now = new Date();
  const [profile] = await db
    .insert(workerProfiles)
    .values({
      login: input.login,
      displayName: input.fallbackDisplayName,
      adminNote: input.adminNote,
      adminNoteUpdatedBy: input.adminNoteUpdatedBy,
      adminNoteUpdatedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workerProfiles.login,
      set: {
        adminNote: input.adminNote,
        adminNoteUpdatedBy: input.adminNoteUpdatedBy,
        adminNoteUpdatedAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return profile;
};
