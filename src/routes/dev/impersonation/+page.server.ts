import { error, fail, redirect, type RequestEvent } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  canUseLocalImpersonation,
  listLocalImpersonationTargets,
  recordLocalImpersonationStop,
  startLocalImpersonation,
} from "$lib/server/auth/localImpersonationService";
import { localImpersonationCookieName } from "$lib/server/auth/localImpersonationPolicy";
import { sessionCookieName } from "$lib/server/auth/session";

const requireLocalAdmin = (event: RequestEvent) => {
  const admin = event.locals.authenticatedUser;
  const sessionId = event.cookies.get(sessionCookieName);
  if (!admin || !sessionId || !canUseLocalImpersonation(event.url, admin))
    error(404, "Not found");
  // 開発サーバーではSvelteKitのOrigin検査が省略されるため、切り替え操作をここで守る。
  if (
    event.request.method === "POST" &&
    event.request.headers.get("origin") !== event.url.origin
  )
    error(403, "同じローカル画面から操作してください。");
  return { admin, sessionId };
};

export const load: PageServerLoad = async (event) => {
  const { admin } = requireLocalAdmin(event);
  return {
    adminLogin: admin.login,
    targets: (await listLocalImpersonationTargets()).filter(
      (target) => target.login !== admin.login,
    ),
  };
};

export const actions: Actions = {
  start: async (event) => {
    const { admin, sessionId } = requireLocalAdmin(event);
    const form = await event.request.formData();
    try {
      const result = await startLocalImpersonation({
        url: event.url,
        authenticatedUser: admin,
        sessionId,
        login: form.get("login"),
      });
      if (!result.ok) return fail(400, { message: result.message });
      // 1時間の期限は署名内で検査する。Cookieを先に消すと古いフォームを管理者として処理してしまう。
      event.cookies.set(localImpersonationCookieName, result.cookie, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: event.url.protocol === "https:",
      });
    } catch {
      return fail(503, {
        message: "ユーザーを切り替えられませんでした。再度お試しください。",
      });
    }
    redirect(303, "/work");
  },
  stop: async (event) => {
    const { admin } = requireLocalAdmin(event);
    if (event.locals.localImpersonation) {
      try {
        await recordLocalImpersonationStop(
          admin.login,
          event.locals.localImpersonation.targetLogin,
        );
      } catch {
        return fail(503, {
          message: "管理者へ戻れませんでした。再度お試しください。",
        });
      }
    }
    event.cookies.delete(localImpersonationCookieName, { path: "/" });
    redirect(303, "/dev/impersonation");
  },
};
