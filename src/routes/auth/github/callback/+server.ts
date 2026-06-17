import { error, redirect } from "@sveltejs/kit";
import {
  exchangeGithubCode,
  fetchGithubUser,
  githubStateCookieName
} from "$lib/server/auth/githubOAuth";
import { createSession, sessionCookieName } from "$lib/server/auth/session";

export const GET = async ({ cookies, url }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies.get(githubStateCookieName);

  if (!code || !state || !expectedState || state !== expectedState) {
    throw error(400, "GitHub OAuth state is invalid");
  }

  cookies.delete(githubStateCookieName, { path: "/" });
  const token = await exchangeGithubCode(code);
  const githubUser = await fetchGithubUser(token);
  const session = await createSession({
    login: githubUser.login,
    name: githubUser.name,
    avatarUrl: githubUser.avatar_url
  });

  cookies.set(sessionCookieName, session.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    expires: session.expiresAt
  });

  throw redirect(303, "/work");
};
