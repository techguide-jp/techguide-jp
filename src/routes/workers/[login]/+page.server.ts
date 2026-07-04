import { fail, redirect } from "@sveltejs/kit";
import { requireAdmin, requireUser } from "$lib/server/auth/guards";
import {
  loadPayoutAccountForViewer,
  updateOwnPayoutAccount,
} from "$lib/server/payoutAccounts/payoutAccountService";
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

  const profile = await loadWorkerProfile(login);
  const payoutAccount = await loadPayoutAccountForViewer(login, user);

  return {
    profile: user.isAdmin
      ? profile
      : {
          ...profile,
          adminNote: "",
          adminNoteUpdatedBy: null,
          adminNoteUpdatedAt: null,
        },
    payoutAccount,
    canEditSelf: user.login === login,
    canEditAdminNote: user.isAdmin,
    canEditPayoutAccount: user.login === login,
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
    if (!result.ok) {
      return fail(400, { message: result.message, outcome: "error" as const });
    }
    return {
      message: "プロフィールを保存しました。",
      outcome: "success" as const,
    };
  },
  savePayoutAccount: async (event) => {
    const user = requireUser(event);
    const result = await updateOwnPayoutAccount(
      await event.request.formData(),
      user.login,
      event.params.login,
    );
    if (!result.ok) {
      return fail(400, { message: result.message, outcome: "error" as const });
    }
    return {
      message: "振込先情報を保存しました。",
      outcome: "success" as const,
    };
  },
  saveAdminNote: async (event) => {
    const user = requireAdmin(event);
    const result = await updateWorkerAdminNote(
      await event.request.formData(),
      user.login,
      user.isAdmin,
      event.params.login,
    );
    if (!result.ok) {
      return fail(400, { message: result.message, outcome: "error" as const });
    }
    return {
      message: "管理者メモを保存しました。",
      outcome: "success" as const,
    };
  },
};
