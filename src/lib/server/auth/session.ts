import { and, count, eq, gt, lt } from "drizzle-orm";
import { createHmac, randomBytes } from "node:crypto";
import { db } from "$lib/server/db/client";
import { authSessions } from "$lib/server/db/schema";
import { env, requireEnv } from "$lib/server/env";
import { ensureWorkerProfile } from "$lib/server/workers/workerProfileService";

const SESSION_DAYS = 30;

export const sessionCookieName = "tg_session";

export type SessionUser = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

const sessionIdHash = (sessionId: string): string => {
  return createHmac("sha256", requireEnv(env.sessionSecret, "SESSION_SECRET"))
    .update(sessionId)
    .digest("base64url");
};

export const createSession = async (user: {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}): Promise<{ id: string; expiresAt: Date }> => {
  const id = randomBytes(32).toString("base64url");
  const hashedId = sessionIdHash(id);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await ensureWorkerProfile({
    login: user.login,
    displayName: user.name,
  });
  await db.insert(authSessions).values({
    id: hashedId,
    githubLogin: user.login,
    githubName: user.name,
    githubAvatarUrl: user.avatarUrl,
    expiresAt,
  });

  return { id, expiresAt };
};

export const resolveSessionUser = async (
  sessionId: string | undefined,
): Promise<SessionUser | null> => {
  if (!sessionId) return null;

  const [session] = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, sessionIdHash(sessionId)),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) return null;

  return {
    login: session.githubLogin,
    name: session.githubName,
    avatarUrl: session.githubAvatarUrl,
    isAdmin: env.adminGithubLogins.has(session.githubLogin.toLowerCase()),
  };
};

export const deleteSession = async (
  sessionId: string | undefined,
): Promise<void> => {
  if (!sessionId) return;
  await db
    .delete(authSessions)
    .where(eq(authSessions.id, sessionIdHash(sessionId)));
};

export const countExpiredSessions = async (): Promise<number> => {
  const [result] = await db
    .select({ value: count() })
    .from(authSessions)
    .where(lt(authSessions.expiresAt, new Date()));
  return result?.value ?? 0;
};

export const deleteExpiredSessions = async (): Promise<number> => {
  const deleted = await db
    .delete(authSessions)
    .where(lt(authSessions.expiresAt, new Date()))
    .returning();
  return deleted.length;
};
