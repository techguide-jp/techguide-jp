export const loginReturnCookieName = "tg_login_return";

export const safeLoginReturn = (value: string | null | undefined): string => {
  // OAuth後の戻り先は案件詳細だけに限定し、外部転送や管理操作への誘導を防ぐ。
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
