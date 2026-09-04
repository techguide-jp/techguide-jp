import { error, redirect } from "@sveltejs/kit";
import {
  exchangeGithubCode,
  fetchGithubPrimaryEmail,
  fetchGithubUser,
  githubStateCookieName,
  resolveOAuthAppOrigin,
} from "$lib/server/auth/githubOAuth";
import { createSession, sessionCookieName } from "$lib/server/auth/session";
import { syncGithubNotificationContact } from "$lib/server/notifications/contactRepository";

export const GET = async ({ cookies, url }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies.get(githubStateCookieName);

  if (!code || !state || !expectedState || state !== expectedState) {
    throw error(400, "GitHub OAuth state is invalid");
  }

  cookies.delete(githubStateCookieName, { path: "/" });
  const token = await exchangeGithubCode(code, resolveOAuthAppOrigin(url));
  const githubUser = await fetchGithubUser(token);

  // メール同期の障害で本人のログインまで失敗させないことが運用上の必須条件。
  try {
    const primaryEmail = await fetchGithubPrimaryEmail(token);
    await syncGithubNotificationContact(githubUser.login, primaryEmail);
  } catch {
    console.warn("GitHub notification email sync failed", {
      login: githubUser.login,
    });
  }

  const session = await createSession({
    login: githubUser.login,
    name: githubUser.name,
    avatarUrl: githubUser.avatar_url,
  });

  cookies.set(sessionCookieName, session.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    expires: session.expiresAt,
  });

  throw redirect(303, "/work");
};
