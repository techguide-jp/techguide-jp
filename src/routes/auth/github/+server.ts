import { redirect } from "@sveltejs/kit";
import {
  createGithubAuthorization,
  githubStateCookieName,
} from "$lib/server/auth/githubOAuth";
import { env } from "$lib/server/env";

export const GET = async ({ cookies, url: requestUrl }) => {
  const appOrigin = new URL(env.appOrigin).origin;
  if (requestUrl.origin !== appOrigin) {
    throw redirect(303, `${appOrigin}/auth/github`);
  }

  const { state, url } = createGithubAuthorization();
  cookies.set(githubStateCookieName, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    maxAge: 60 * 10,
  });
  throw redirect(303, url);
};
