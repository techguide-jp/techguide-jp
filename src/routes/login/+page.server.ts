import { safeLoginReturn } from "$lib/server/auth/loginReturn";
import { redirect } from "@sveltejs/kit";

export const load = ({ url, locals }) => {
  const returnTo = safeLoginReturn(url.searchParams.get("returnTo"));
  if (locals.user) redirect(303, returnTo);
  return { returnTo };
};
