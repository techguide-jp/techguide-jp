import { fail } from "@sveltejs/kit";
import { addMonths, currentJstMonth } from "$lib/month";
import { monthlyLetterMaxLength } from "$lib/monthlyLetter";
import { requireAdmin } from "$lib/server/auth/guards";
import {
  getMonthlyWorkerLetter,
  saveMonthlyWorkerLetter,
} from "$lib/server/notifications/monthlyLetterRepository";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const settlementMonth = currentJstMonth();
  const sendMonth = addMonths(settlementMonth, 1);
  return {
    sendMonth,
    settlementMonth,
    letter: await getMonthlyWorkerLetter(sendMonth),
  };
};

export const actions = {
  save: async (event) => {
    const admin = requireAdmin(event);
    const form = await event.request.formData();
    const body = String(form.get("body") ?? "");
    const sendMonth = String(form.get("sendMonth") ?? "");
    const version = Number(form.get("version") ?? "invalid");
    if (sendMonth !== addMonths(currentJstMonth(), 1)) {
      return fail(409, {
        message:
          "編集できる配信月が変わりました。入力を控えて画面を再読み込みしてください。",
        body,
        sendMonth,
      });
    }
    if (!Number.isSafeInteger(version) || version < 0 || version > 2147483647) {
      return fail(400, {
        message: "画面を開き直してください。",
        body,
        sendMonth,
      });
    }
    if (body.length > monthlyLetterMaxLength) {
      return fail(400, {
        message: `本文は${monthlyLetterMaxLength.toLocaleString("ja-JP")}文字以内で入力してください。`,
        body,
        sendMonth,
        version,
      });
    }

    try {
      const saved = await saveMonthlyWorkerLetter({
        sendMonth,
        body: body.replace(/\r\n?/g, "\n").trim(),
        updatedBy: admin.login,
        version,
      });
      if (!saved) {
        return fail(409, {
          message:
            "別の画面で本文が更新されました。入力を控えて再読み込みしてください。",
          body,
          sendMonth,
          version,
        });
      }
      return { message: "お手紙を保存しました。" };
    } catch {
      return fail(500, {
        message:
          "お手紙を保存できませんでした。時間をおいて再度お試しください。",
        body,
        sendMonth,
        version,
      });
    }
  },
} satisfies Actions;
