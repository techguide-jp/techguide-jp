import { env, requireEnv } from "$lib/server/env";
import type { GraphQLResponse } from "$lib/server/github/projectGraphqlTypes";

export const graphQL = async <T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${requireEnv(env.githubProjectToken, "GITHUB_PROJECT_TOKEN")}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status}`);
  }

  const payload = (await response.json()) as GraphQLResponse<unknown>;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload as T;
};
