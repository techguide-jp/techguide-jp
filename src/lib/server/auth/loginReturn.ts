import { monthlyLetterAdminHref } from "$lib/monthlyLetter";
import { workerPreferencesEntryHref } from "$lib/workerPreferences";

export const loginReturnCookieName = "tg_login_return";

export const safeLoginReturn = (value: string | null | undefined): string => {
  // メールのリンクは読み取り先だけを許可し、URLやクエリの外部転送を防ぐ。
  if (
    value === workerPreferencesEntryHref ||
    value === monthlyLetterAdminHref ||
    (value &&
      /^\/settlements\/\d{4}-(0[1-9]|1[0-2])\/[a-zA-Z0-9-]+$/.test(value))
  ) {
    return value;
  }
  if (
    !value ||
    !/^\/work\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+\/[1-9]\d*$/.test(value)
  )
    return "/work";
  const [, , owner, repo, number] = value.split("/");
  if (
    !owner ||
    [".", ".."].includes(repo) ||
    !Number.isSafeInteger(Number(number))
  )
    return "/work";
  return value;
};
