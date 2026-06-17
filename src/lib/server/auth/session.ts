import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "$lib/server/db/client";
import { authSessions } from "$lib/server/db/schema";
import { env } from "$lib/server/env";

const SESSION_DAYS = 30;

export const sessionCookieName = "tg_session";

export type SessionUser = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

export const createSession = async (user: {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}): Promise<{ id: string; expiresAt: Date }> => {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(authSessions).values({
    id,
    githubLogin: user.login,
    githubName: user.name,
    githubAvatarUrl: user.avatarUrl,
    expiresAt
  });

  return { id, expiresAt };
};

export const resolveSessionUser = async (sessionId: string | undefined): Promise<SessionUser | null> => {
  if (!sessionId) return null;

  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.id, sessionId), gt(authSessions.expiresAt, new Date())))
    .limit(1);

  if (!session) return null;

  return {
    login: session.githubLogin,
    name: session.githubName,
    avatarUrl: session.githubAvatarUrl,
    isAdmin: env.adminGithubLogins.has(session.githubLogin)
  };
};

export const deleteSession = async (sessionId: string | undefined): Promise<void> => {
  if (!sessionId) return;
  await db.delete(authSessions).where(eq(authSessions.id, sessionId));
};
