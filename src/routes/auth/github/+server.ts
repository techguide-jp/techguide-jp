import { redirect } from "@sveltejs/kit";
import {
  createGithubAuthorization,
  githubStateCookieName,
  resolveOAuthAppOrigin,
} from "$lib/server/auth/githubOAuth";

export const GET = async ({ cookies, url: requestUrl }) => {
  const appOrigin = resolveOAuthAppOrigin(requestUrl);
  if (requestUrl.origin !== appOrigin) {
    throw redirect(303, `${appOrigin}/auth/github`);
  }

  const { state, url } = createGithubAuthorization(appOrigin);
  cookies.set(githubStateCookieName, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    maxAge: 60 * 10,
  });
  throw redirect(303, url);
};
