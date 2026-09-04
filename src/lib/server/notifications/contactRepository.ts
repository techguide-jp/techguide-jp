import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import {
  userNotificationContacts,
  type UserNotificationContact,
} from "$lib/server/db/schema";

export const normalizeNotificationLogin = (githubLogin: string): string =>
  githubLogin.trim().toLowerCase();

export const syncGithubNotificationContact = async (
  githubLogin: string,
  email: string | null,
): Promise<void> => {
  const normalizedLogin = normalizeNotificationLogin(githubLogin);
  if (!email) {
    await db
      .delete(userNotificationContacts)
      .where(eq(userNotificationContacts.githubLogin, normalizedLogin));
    return;
  }
  const now = new Date();
  await db
    .insert(userNotificationContacts)
    .values({
      githubLogin: normalizedLogin,
      email,
      source: "github",
      syncedAt: now,
    })
    .onConflictDoUpdate({
      target: userNotificationContacts.githubLogin,
      set: { email, source: "github", syncedAt: now, updatedAt: now },
    });
};

export const getNotificationContact = async (
  githubLogin: string,
): Promise<UserNotificationContact | null> => {
  const [contact] = await db
    .select()
    .from(userNotificationContacts)
    .where(
      eq(
        userNotificationContacts.githubLogin,
        normalizeNotificationLogin(githubLogin),
      ),
    )
    .limit(1);
  return contact ?? null;
};

export const listNotificationContacts = async (
  logins: string[],
): Promise<UserNotificationContact[]> => {
  const normalizedLogins = [
    ...new Set(logins.map(normalizeNotificationLogin).filter(Boolean)),
  ];
  if (normalizedLogins.length === 0) return [];
  return db
    .select()
    .from(userNotificationContacts)
    .where(inArray(userNotificationContacts.githubLogin, normalizedLogins));
};
