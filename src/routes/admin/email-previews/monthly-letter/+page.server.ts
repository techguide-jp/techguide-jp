import { fail } from "@sveltejs/kit";
import { addMonths, currentJstMonth } from "$lib/month";
import {
  monthlyLetterMaxLength,
  monthlyLetterSubjectMaxLength,
} from "$lib/monthlyLetter";
import { requireAdmin } from "$lib/server/auth/guards";
import { env } from "$lib/server/env";
import {
  getMonthlyLetterTemplates,
  getMonthlyWorkerLetter,
  saveMonthlyLetterTemplates,
  saveMonthlyWorkerLetter,
} from "$lib/server/notifications/monthlyLetterRepository";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const settlementMonth = currentJstMonth();
  const sendMonth = addMonths(settlementMonth, 1);
  const [letter, templates] = await Promise.all([
    getMonthlyWorkerLetter(sendMonth),
    getMonthlyLetterTemplates(),
  ]);
  return {
    sendMonth,
    settlementMonth,
    previewOrigin: env.appOrigin ?? event.url.origin,
    previewHasReplyTo: Boolean(env.emailReplyTo),
    letter,
    templates,
  };
};

export const actions = {
  saveTemplates: async (event) => {
    requireAdmin(event);
    const form = await event.request.formData();
    const templateInput = {
      requiredSubject: String(form.get("requiredSubject") ?? ""),
      standardSubject: String(form.get("standardSubject") ?? ""),
      defaultBody: String(form.get("defaultBody") ?? ""),
    };
    const versionField = String(form.get("templatesVersion") ?? "");
    const version = Number(versionField);
    const inputs = { templateInput, templatesVersion: versionField };

    if (!/^\d+$/.test(versionField) || version >= 2147483647) {
      return fail(400, {
        ...inputs,
        templatesMessage: "画面を開き直してください。",
      });
    }
    if (
      [templateInput.requiredSubject, templateInput.standardSubject].some(
        (subject) =>
          !subject.trim() ||
          subject.length > monthlyLetterSubjectMaxLength ||
          /[\r\n\u0085\u2028\u2029]/.test(subject),
      )
    ) {
      return fail(400, {
        ...inputs,
        templatesMessage: `件名はどちらも${monthlyLetterSubjectMaxLength}文字以内の1行で入力してください。`,
      });
    }
    if (
      !templateInput.defaultBody.trim() ||
      templateInput.defaultBody.length > monthlyLetterMaxLength
    ) {
      return fail(400, {
        ...inputs,
        templatesMessage: `デフォルト文は1〜${monthlyLetterMaxLength.toLocaleString("ja-JP")}文字で入力してください。`,
      });
    }

    try {
      const saved = await saveMonthlyLetterTemplates(
        {
          requiredSubject: templateInput.requiredSubject.trim(),
          standardSubject: templateInput.standardSubject.trim(),
          defaultBody: templateInput.defaultBody.replace(/\r\n?/g, "\n").trim(),
        },
        version,
      );
      if (!saved) {
        return fail(409, {
          ...inputs,
          templatesMessage:
            "別の画面で共通設定が更新されました。入力を控えて再読み込みしてください。",
        });
      }
      return { templatesMessage: "月次メールの共通設定を保存しました。" };
    } catch {
      return fail(500, {
        ...inputs,
        templatesMessage:
          "共通設定を保存できませんでした。時間をおいて再度お試しください。",
      });
    }
  },
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
