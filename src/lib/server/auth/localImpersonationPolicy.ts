import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const localImpersonationCookieName = "tg_local_user";
export const localImpersonationMaxAge = 60 * 60;
export const localUserLoginSchema = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[A-Za-z0-9-]+$/);

const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const isLocalImpersonationEnvironment = (input: {
  dev: boolean;
  url: URL;
  databaseUrl: string | undefined;
  vercelEnvironment: string | undefined;
  emailDeliveryMode: string;
}): boolean => {
  // 表示を隠すだけでなく、本番ビルド・外部DB・外部配送では擬似ログインを適用しない。
  if (
    !input.dev ||
    input.vercelEnvironment ||
    !localHostnames.has(input.url.hostname) ||
    input.emailDeliveryMode !== "preview" ||
    !input.databaseUrl
  )
    return false;
  try {
    const database = new URL(input.databaseUrl);
    return (
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      localHostnames.has(database.hostname) &&
      ![...database.searchParams.keys()].some((key) =>
        ["host", "hostaddr", "service"].includes(key.toLowerCase()),
      )
    );
  } catch {
    return false;
  }
};

const sign = (payload: string, sessionId: string, secret: string): string =>
  createHmac("sha256", secret)
    .update(`local-impersonation:${sessionId}:${payload}`)
    .digest("base64url");

export const createLocalImpersonationCookie = (
  login: string,
  sessionId: string,
  secret: string,
  now = Date.now(),
): string => {
  const payload = Buffer.from(
    JSON.stringify({
      login: localUserLoginSchema.parse(login),
      expiresAt: now + localImpersonationMaxAge * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload, sessionId, secret)}`;
};

export const readLocalImpersonationCookie = (
  cookie: string,
  sessionId: string,
  secret: string,
  now = Date.now(),
): string | null => {
  if (cookie.length > 512) return null;
  const [payload, signature, extra] = cookie.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, sessionId, secret));
  const supplied = Buffer.from(signature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return null;
  try {
    const parsed = z
      .object({ login: localUserLoginSchema, expiresAt: z.number().int() })
      .safeParse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    return parsed.success && parsed.data.expiresAt > now
      ? parsed.data.login
      : null;
  } catch {
    return null;
  }
};
