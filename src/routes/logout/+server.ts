import { redirect } from "@sveltejs/kit";
import { deleteSession, sessionCookieName } from "$lib/server/auth/session";

export const GET = async ({ cookies }) => {
  await deleteSession(cookies.get(sessionCookieName));
  cookies.delete(sessionCookieName, { path: "/" });
  throw redirect(303, "/login");
};
