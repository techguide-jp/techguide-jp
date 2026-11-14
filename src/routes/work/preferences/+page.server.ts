import { redirect } from "@sveltejs/kit";
import { workerPreferencesAnchor } from "$lib/workerPreferences";
import { requireUser } from "$lib/server/auth/guards";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = (event) => {
  const user = requireUser(event);
  redirect(
    303,
    `/workers/${encodeURIComponent(user.login)}#${workerPreferencesAnchor}`,
  );
};
