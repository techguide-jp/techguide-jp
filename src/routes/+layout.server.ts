import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, params, route, url }) => {
  const user = locals.user;
  // 共用画面では、管理一覧から本人の詳細を開いた場合も管理表示を引き継ぐ。
  const isAdminView = Boolean(
    user?.isAdmin &&
    (route.id?.startsWith("/admin/") ||
      route.id === "/dev/impersonation" ||
      route.id === "/settlements/[month]" ||
      (params.login && params.login !== user.login) ||
      (params.assignee && params.assignee !== user.login) ||
      ((params.login || params.assignee || params.number) &&
        url.searchParams.get("mode") === "admin")),
  );

  return {
    user,
    isAdminView,
    localImpersonationAvailable: locals.localImpersonationAvailable,
    localImpersonation: locals.localImpersonation,
  };
};
