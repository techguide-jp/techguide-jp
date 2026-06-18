import { randomBytes } from "node:crypto";
import { env, requireEnv } from "$lib/server/env";

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  login: string;
  name: string | null;
  avatar_url: string | null;
};

export const githubStateCookieName = "tg_github_oauth_state";

export const createGithubAuthorization = (): { state: string; url: string } => {
  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set(
    "client_id",
    requireEnv(env.githubClientId, "GITHUB_CLIENT_ID"),
  );
  url.searchParams.set("redirect_uri", `${env.appOrigin}/auth/github/callback`);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return { state, url: url.toString() };
};

export const exchangeGithubCode = async (code: string): Promise<string> => {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: requireEnv(env.githubClientId, "GITHUB_CLIENT_ID"),
      client_secret: requireEnv(env.githubClientSecret, "GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: `${env.appOrigin}/auth/github/callback`,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const payload = (await response.json()) as GitHubTokenResponse;
  if (!payload.access_token) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "GitHub token was not returned",
    );
  }

  return payload.access_token;
};

export const fetchGithubUser = async (
  accessToken: string,
): Promise<GitHubUserResponse> => {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub user fetch failed: ${response.status}`);
  }

  return (await response.json()) as GitHubUserResponse;
};
