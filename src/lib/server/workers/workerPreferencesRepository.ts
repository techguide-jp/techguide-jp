import { sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { workerProfiles } from "$lib/server/db/schema";
import type { WorkerPreferencesInput } from "$lib/workerPreferences";

export const saveWorkerPreferences = async (
  login: string,
  input: WorkerPreferencesInput,
): Promise<boolean> => {
  const [saved] = await db
    .insert(workerProfiles)
    .values({
      login,
      displayName: login,
      availabilityNote: input.availabilityNote,
      selfAssignmentNote: input.selfAssignmentNote,
      partnerInterest: input.partnerInterest || null,
      partnerConditions: input.partnerConditions,
      preferencesVersion: 1,
      preferencesUpdatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workerProfiles.login,
      set: {
        availabilityNote: input.availabilityNote,
        selfAssignmentNote: input.selfAssignmentNote,
        partnerInterest: input.partnerInterest || null,
        partnerConditions: input.partnerConditions,
        preferencesVersion: sql`${workerProfiles.preferencesVersion} + 1`,
        preferencesUpdatedAt: new Date(),
        updatedAt: new Date(),
      },
      setWhere: sql`${workerProfiles.preferencesVersion} = ${input.version}`,
    })
    .returning();
  return Boolean(saved);
};
