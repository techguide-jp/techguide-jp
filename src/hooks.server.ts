import type { Handle } from "@sveltejs/kit";
import { resolveSessionUser } from "$lib/server/auth/session";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = await resolveSessionUser(event.cookies.get("tg_session"));
  return resolve(event);
};
