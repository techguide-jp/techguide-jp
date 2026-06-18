import { fail, redirect } from "@sveltejs/kit";
import { requireAdmin, requireUser } from "$lib/server/auth/guards";
import {
  loadWorkerProfile,
  updateWorkerAdminNote,
  updateWorkerSelfProfile,
} from "$lib/server/workers/workerProfileService";

export const load = async (event) => {
  const user = requireUser(event);
  const login = event.params.login;
  if (!user.isAdmin && user.login !== login) {
    throw redirect(303, "/work");
  }

  return {
    profile: await loadWorkerProfile(login),
    canEditSelf: user.login === login,
    canEditAdminNote: user.isAdmin,
  };
};

export const actions = {
  saveSelfProfile: async (event) => {
    const user = requireUser(event);
    const result = await updateWorkerSelfProfile(
      await event.request.formData(),
      user.login,
      event.params.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "プロフィールを保存しました。" };
  },
  saveAdminNote: async (event) => {
    const user = requireAdmin(event);
    const result = await updateWorkerAdminNote(
      await event.request.formData(),
      user.login,
      user.isAdmin,
      event.params.login,
    );
    if (!result.ok) return fail(400, { message: result.message });
    return { message: "管理者メモを保存しました。" };
  },
};
