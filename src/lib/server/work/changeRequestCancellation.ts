import { z } from "zod";
import { cancelPendingChangeRequest } from "$lib/server/work/changeRequestCancellationRepository";

export const cancelWorkLogChange = async (
  requestId: string,
  login: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (!z.uuid().safeParse(requestId).success)
    return { ok: false, message: "修正申請の指定が不正です。" };
  if (!(await cancelPendingChangeRequest(requestId, login)))
    return {
      ok: false,
      message:
        "本人の未処理の申請だけ取り消せます。すでに処理された場合は再読み込みしてください。",
    };
  return { ok: true };
};
