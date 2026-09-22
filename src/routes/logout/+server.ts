import { redirect } from "@sveltejs/kit";
import { deleteSession, sessionCookieName } from "$lib/server/auth/session";
import { localImpersonationCookieName } from "$lib/server/auth/localImpersonationPolicy";

export const GET = async ({ cookies }) => {
  await deleteSession(cookies.get(sessionCookieName));
  cookies.delete(sessionCookieName, { path: "/" });
  cookies.delete(localImpersonationCookieName, { path: "/" });
  throw redirect(303, "/login");
};
