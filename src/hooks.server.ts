import { error, type Handle } from "@sveltejs/kit";
import {
  resolveSessionUser,
  sessionCookieName,
} from "$lib/server/auth/session";
import {
  canUseLocalImpersonation,
  resolveLocalImpersonation,
} from "$lib/server/auth/localImpersonationService";
import { localImpersonationCookieName } from "$lib/server/auth/localImpersonationPolicy";
import { runWithLocalImpersonation } from "$lib/server/auth/localImpersonationContext";

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(sessionCookieName);
  const authenticatedUser = await resolveSessionUser(sessionId);
  const available = canUseLocalImpersonation(event.url, authenticatedUser);
  const cookie = event.cookies.get(localImpersonationCookieName);
  const target = await resolveLocalImpersonation({
    available,
    authenticatedUser,
    sessionId,
    cookie,
  });
  event.locals.authenticatedUser = authenticatedUser;
  event.locals.localImpersonationAvailable = available;
  event.locals.localImpersonation = target
    ? { adminLogin: authenticatedUser!.login, targetLogin: target.login }
    : null;
  event.locals.user = target ?? authenticatedUser;
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(event.request.method);
  // 開発時の既存フォームも、擬似ログイン中は別Originからの操作を受け付けない。
  if (
    target &&
    isWrite &&
    event.request.headers.get("origin") !== event.url.origin
  )
    error(403, "同じローカル画面から操作してください。");
  if (cookie && !target) {
    event.cookies.delete(localImpersonationCookieName, { path: "/" });
    // 対象者の操作を、期限切れ後に管理者として実行してしまうことを防ぐ。
    if (isWrite)
      error(409, "擬似ログインが終了しました。再読み込みしてください。");
  }
  return runWithLocalImpersonation(event.locals.localImpersonation, () =>
    resolve(event),
  );
};
