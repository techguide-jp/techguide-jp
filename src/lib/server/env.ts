import { dev } from "$app/environment";
import { env as privateEnv } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";

const normalize = (value: string | undefined): string | undefined =>
  value && value.trim().length > 0 ? value.trim() : undefined;

const optional = (name: string): string | undefined => {
  const value = privateEnv[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
};

const optionalPublic = (name: keyof typeof publicEnv): string | undefined =>
  normalize(publicEnv[name]);

const loginSet = (name: string): Set<string> => {
  return new Set(
    (optional(name) ?? "")
      .split(",")
      .map((login) => login.trim().toLowerCase())
      .filter(Boolean),
  );
};

export const env = {
  databaseUrl: optional("DATABASE_URL"),
  githubClientId: optional("GITHUB_CLIENT_ID"),
  githubClientSecret: optional("GITHUB_CLIENT_SECRET"),
  githubProjectToken: optional("GITHUB_PROJECT_TOKEN"),
  sessionSecret:
    optional("SESSION_SECRET") ??
    (dev ? "development-session-secret" : undefined),
  appOrigin: optionalPublic("PUBLIC_APP_ORIGIN") ?? "http://localhost:5173",
  adminGithubLogins: loginSet("ADMIN_GITHUB_LOGINS"),
};

export const requireEnv = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};
