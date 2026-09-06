import { z } from "zod";
import type {
  MonthlyFeedbackInput,
  MonthlyFeedbackView,
} from "$lib/monthlyFeedback";
import {
  getMonthlyFeedback,
  updateMonthlyFeedback,
} from "$lib/server/settlements/monthlyFeedbackRepository";

const schema = z.object({
  operatorComment: z
    .string()
    .max(2000)
    .transform((value) => value.trim()),
  privateReflection: z
    .string()
    .max(2000)
    .transform((value) => value.trim()),
  version: z.number().int().nonnegative(),
});
export const parseMonthlyFeedback = (input: MonthlyFeedbackInput) =>
  schema.safeParse(input);
export const loadMonthlyFeedbackForViewer = async (
  month: string,
  login: string,
  viewer: { login: string; isAdmin: boolean },
): Promise<MonthlyFeedbackView | null> => {
  if (viewer.login !== login && !viewer.isAdmin) return null;
  return getMonthlyFeedback(month, login, viewer.login === login);
};
export const saveOwnMonthlyFeedback = async (
  month: string,
  login: string,
  actorLogin: string,
  input: MonthlyFeedbackInput,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (login !== actorLogin)
    return { ok: false, message: "本人以外の月次コメントは更新できません。" };
  const parsed = parseMonthlyFeedback(input);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !parsed.success)
    return {
      ok: false,
      message:
        "対象月と入力内容を確認してください。各コメントは2,000文字以内で入力してください。",
    };
  const saved = await updateMonthlyFeedback(month, login, parsed.data);
  return saved
    ? { ok: true }
    : {
        ok: false,
        message:
          "申請済み・未承認の月だけ更新できます。別の画面で変更された場合は、入力内容を控えて再読み込みしてください。",
      };
};
