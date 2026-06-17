import { dev } from "$app/environment";

const optional = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
};

export const env = {
  databaseUrl: optional("DATABASE_URL"),
  githubClientId: optional("GITHUB_CLIENT_ID"),
  githubClientSecret: optional("GITHUB_CLIENT_SECRET"),
  githubProjectToken: optional("GITHUB_PROJECT_TOKEN"),
  sessionSecret: optional("SESSION_SECRET") ?? (dev ? "development-session-secret" : undefined),
  appOrigin: optional("PUBLIC_APP_ORIGIN") ?? "http://localhost:5173",
  adminGithubLogins: new Set(
    (optional("ADMIN_GITHUB_LOGINS") ?? "")
      .split(",")
      .map((login) => login.trim())
      .filter(Boolean)
  )
};

export const requireEnv = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};
