import { redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { safeLoginReturn } from "$lib/server/auth/loginReturn";

export const requireUser = (event: RequestEvent) => {
  if (!event.locals.user) {
    const returnTo = safeLoginReturn(event.url.pathname);
    if (event.request.method === "GET" && returnTo !== "/work") {
      throw redirect(303, `/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    throw redirect(303, "/login");
  }
  return event.locals.user;
};

export const requireAdmin = (event: RequestEvent) => {
  const user = requireUser(event);
  if (!user.isAdmin) {
    throw redirect(303, "/work");
  }
  return user;
};

export const requireSelfOrAdmin = (
  event: RequestEvent,
  assigneeLogin: string,
) => {
  const user = requireUser(event);
  if (!user.isAdmin && user.login !== assigneeLogin) {
    throw redirect(303, "/work");
  }
  return user;
};
