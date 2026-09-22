import { AsyncLocalStorage } from "node:async_hooks";

type LocalImpersonation = { adminLogin: string; targetLogin: string };

// 並行リクエストへ外部更新の抑止を漏らさないため、環境変数の書き換えは使わない。
const context = new AsyncLocalStorage<LocalImpersonation | null>();

export const runWithLocalImpersonation = <T>(
  value: LocalImpersonation | null,
  callback: () => T,
): T => context.run(value, callback);

export const isLocalImpersonationActive = (): boolean =>
  Boolean(context.getStore());
