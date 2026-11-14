import { version } from "$app/environment";
import { assets } from "$app/paths";

const refreshAttemptKey = "techguide:deployment-refresh";

const refreshDeploymentAfterReload = async (
  signal: AbortSignal,
): Promise<void> => {
  try {
    // バージョンの確認だけは旧デプロイのCookieを送らず、本番URLの最新版を参照する。
    const response = await fetch(`${assets}/_app/version.json`, {
      cache: "no-store",
      credentials: "omit",
      signal,
    });
    if (!response.ok) return;
    const latest: { version?: string } = await response.json();
    if (!latest.version || latest.version === version) {
      sessionStorage.removeItem(refreshAttemptKey);
      return;
    }
    if (sessionStorage.getItem(refreshAttemptKey) === latest.version) return;

    const refreshed = await fetch("/api/deployment-refresh", {
      method: "POST",
      signal,
    });
    if (refreshed.status !== 204 || signal.aborted) return;
    // Cookieの消去に失敗しても、同じ版に向けて再読み込みを繰り返さない。
    sessionStorage.setItem(refreshAttemptKey, latest.version);
    window.location.reload();
  } catch {
    // 確認に失敗した場合は開いている画面で作業を続けられる。
  }
};

export const watchDeploymentAfterReload = () => {
  const [navigation] = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];
  if (navigation?.type !== "reload") return;

  const controller = new AbortController();
  const stop = () => controller.abort();
  // 再読み込み直後に入力を始めた場合は、版の切り替えを中断する。
  window.addEventListener("input", stop, {
    once: true,
    signal: controller.signal,
  });
  void refreshDeploymentAfterReload(controller.signal).finally(stop);
  return stop;
};
