import { and, eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import {
  githubProjectStatusSyncs,
  type GithubProjectStatusSync,
} from "$lib/server/db/schema";

type StatusSyncInput = {
  projectItemId: string;
  repository: string;
  issueNumber: number;
  issueTitle: string;
  assigneeLogin: string;
  targetStatus: string;
  errorMessage: string;
};

export const listPendingProjectStatusSyncs = async (): Promise<
  GithubProjectStatusSync[]
> => {
  return db
    .select()
    .from(githubProjectStatusSyncs)
    .where(eq(githubProjectStatusSyncs.status, "pending"));
};

export const listPendingProjectStatusSyncsForAssignee = async (
  assigneeLogin: string,
): Promise<GithubProjectStatusSync[]> => {
  return db
    .select()
    .from(githubProjectStatusSyncs)
    .where(
      and(
        eq(githubProjectStatusSyncs.status, "pending"),
        eq(githubProjectStatusSyncs.assigneeLogin, assigneeLogin),
      ),
    );
};

export const getPendingProjectStatusSync = async (
  syncId: string,
): Promise<GithubProjectStatusSync | null> => {
  const [sync] = await db
    .select()
    .from(githubProjectStatusSyncs)
    .where(
      and(
        eq(githubProjectStatusSyncs.id, syncId),
        eq(githubProjectStatusSyncs.status, "pending"),
      ),
    )
    .limit(1);
  return sync ?? null;
};

export const upsertPendingProjectStatusSync = async (
  input: StatusSyncInput,
): Promise<GithubProjectStatusSync> => {
  const now = new Date();
  const [sync] = await db
    .insert(githubProjectStatusSyncs)
    .values({
      ...input,
      attemptedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        githubProjectStatusSyncs.projectItemId,
        githubProjectStatusSyncs.targetStatus,
      ],
      targetWhere: sql`${githubProjectStatusSyncs.status} = 'pending'`,
      set: {
        repository: input.repository,
        issueNumber: input.issueNumber,
        issueTitle: input.issueTitle,
        assigneeLogin: input.assigneeLogin,
        errorMessage: input.errorMessage,
        attemptedAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return sync;
};

export const markProjectStatusSyncAttemptFailed = async (
  syncId: string,
  errorMessage: string,
): Promise<GithubProjectStatusSync | null> => {
  const [sync] = await db
    .update(githubProjectStatusSyncs)
    .set({
      errorMessage,
      attemptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(githubProjectStatusSyncs.id, syncId),
        eq(githubProjectStatusSyncs.status, "pending"),
      ),
    )
    .returning();
  return sync ?? null;
};

export const resolveProjectStatusSync = async (
  syncId: string,
): Promise<GithubProjectStatusSync | null> => {
  const [sync] = await db
    .update(githubProjectStatusSyncs)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(githubProjectStatusSyncs.id, syncId),
        eq(githubProjectStatusSyncs.status, "pending"),
      ),
    )
    .returning();
  return sync ?? null;
};
