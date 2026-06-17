import { redirect } from "@sveltejs/kit";
import { createGithubAuthorization, githubStateCookieName } from "$lib/server/auth/githubOAuth";

export const GET = async ({ cookies, url: requestUrl }) => {
  const { state, url } = createGithubAuthorization();
  cookies.set(githubStateCookieName, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    maxAge: 60 * 10
  });
  throw redirect(303, url);
};
