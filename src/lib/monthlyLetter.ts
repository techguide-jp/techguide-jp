import { formatMonthLabel } from "$lib/month";

export const monthlyLetterAdminHref = "/admin/email-previews/monthly-letter";
export const monthlyLetterMaxLength = 4000;
export const monthlyLetterSubjectMaxLength = 200;

export const monthlyLetterSubmissionStatuses = [
  { value: "required", label: "未申請（精算対象あり）" },
  { value: "submitted", label: "申請済み" },
  { value: "approved", label: "承認済み" },
  { value: "not_required", label: "精算対象なし" },
] as const;

export type MonthlyLetterSubmissionStatus =
  (typeof monthlyLetterSubmissionStatuses)[number]["value"];

export const defaultMonthlyLetterTemplates = {
  requiredSubject: "【TechGuide】{対象月}分のお手紙と月次確定申請のご案内",
  standardSubject: "【TechGuide】{対象月}分のお手紙とアンケート",
  defaultBody:
    "{対象月}も、TechGuideの業務にお力添えいただき、ありがとうございました。今後の稼働や取り組みたい仕事について、現在のご希望をお聞かせいただけると幸いです。",
};

export type MonthlyLetterTemplates = typeof defaultMonthlyLetterTemplates;

export const renderMonthlyLetterTemplate = (template: string, month: string) =>
  template.replaceAll("{対象月}", formatMonthLabel(month));
