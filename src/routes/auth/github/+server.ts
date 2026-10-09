import { redirect } from "@sveltejs/kit";
import {
  loginReturnCookieName,
  safeLoginReturn,
} from "$lib/server/auth/loginReturn";
import {
  createGithubAuthorization,
  githubStateCookieName,
  resolveOAuthAppOrigin,
} from "$lib/server/auth/githubOAuth";

export const GET = async ({ cookies, url: requestUrl }) => {
  const appOrigin = resolveOAuthAppOrigin(requestUrl);
  if (requestUrl.origin !== appOrigin) {
    throw redirect(
      303,
      `${appOrigin}/auth/github?returnTo=${encodeURIComponent(safeLoginReturn(requestUrl.searchParams.get("returnTo")))}`,
    );
  }

  const { state, url } = createGithubAuthorization(appOrigin);
  cookies.set(
    loginReturnCookieName,
    safeLoginReturn(requestUrl.searchParams.get("returnTo")),
    {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: requestUrl.protocol === "https:",
      maxAge: 60 * 10,
    },
  );
  cookies.set(githubStateCookieName, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    maxAge: 60 * 10,
  });
  throw redirect(303, url);
};
