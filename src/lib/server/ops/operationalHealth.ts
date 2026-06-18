import { sql } from "drizzle-orm";
import {
  countExpiredSessions,
  deleteExpiredSessions,
} from "$lib/server/auth/session";
import { createAuditLog } from "$lib/server/audit/auditRepository";
import { db, isDatabaseConfigured } from "$lib/server/db/client";
import { env } from "$lib/server/env";
import { getProjectClientRuntimeHealth } from "$lib/server/github/projectClient";

export type OperationalHealth = {
  database: {
    configured: boolean;
    reachable: boolean;
    error: string | null;
    expiredSessionCount: number | null;
  };
  environment: {
    githubClientId: boolean;
    githubClientSecret: boolean;
    githubProjectToken: boolean;
    sessionSecret: boolean;
    adminGithubLogins: number;
    e2eTestMode: boolean;
  };
  projectClient: ReturnType<typeof getProjectClientRuntimeHealth>;
};

const checkDatabaseReachability = async (): Promise<{
  reachable: boolean;
  error: string | null;
}> => {
  if (!isDatabaseConfigured()) {
    return { reachable: false, error: "DATABASE_URL is not configured" };
  }

  try {
    await db.execute(sql`select 1`);
    return { reachable: true, error: null };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : "Database check failed",
    };
  }
};

export const loadOperationalHealth = async (): Promise<OperationalHealth> => {
  const database = await checkDatabaseReachability();
  const expiredSessionCount = database.reachable
    ? await countExpiredSessions()
    : null;

  return {
    database: {
      configured: isDatabaseConfigured(),
      reachable: database.reachable,
      error: database.error,
      expiredSessionCount,
    },
    environment: {
      githubClientId: Boolean(env.githubClientId),
      githubClientSecret: Boolean(env.githubClientSecret),
      githubProjectToken: Boolean(env.githubProjectToken),
      sessionSecret: Boolean(env.sessionSecret),
      adminGithubLogins: env.adminGithubLogins.size,
      e2eTestMode: env.e2eTestMode,
    },
    projectClient: getProjectClientRuntimeHealth(),
  };
};

export const cleanupExpiredSessions = async (
  actorLogin: string,
): Promise<{ deletedCount: number }> => {
  const deletedCount = await deleteExpiredSessions();
  await createAuditLog({
    actorLogin,
    action: "expired_sessions_deleted",
    targetType: "auth_sessions",
    targetId: "expired",
    details: { deletedCount },
  });
  return { deletedCount };
};
