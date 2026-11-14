import { formatMonthLabel } from "$lib/month";

export const monthlyLetterAdminHref = "/admin/email-previews/monthly-letter";
export const monthlyLetterMaxLength = 4000;

export const monthlyLetterSubmissionStatuses = [
  { value: "required", label: "未申請（精算対象あり）" },
  { value: "submitted", label: "申請済み" },
  { value: "approved", label: "承認済み" },
  { value: "not_required", label: "精算対象なし" },
] as const;

export type MonthlyLetterSubmissionStatus =
  (typeof monthlyLetterSubmissionStatuses)[number]["value"];

export const defaultMonthlyLetter = (month: string): string =>
  `${formatMonthLabel(month)}も、TechGuideの業務にお力添えいただき、ありがとうございました。今後の稼働や取り組みたい仕事について、現在のご希望をお聞かせいただけると幸いです。`;
