import { error, redirect } from "@sveltejs/kit";
import { createSession, sessionCookieName } from "$lib/server/auth/session";
import { env } from "$lib/server/env";

export const GET = async ({ cookies, url }) => {
  if (!env.e2eTestMode) {
    throw error(404, "Not found");
  }

  const login = url.searchParams.get("login") ?? "tashua314";
  const session = await createSession({
    login,
    name: login,
    avatarUrl: null,
  });

  cookies.set(sessionCookieName, session.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    expires: session.expiresAt,
  });

  throw redirect(303, "/work");
};
