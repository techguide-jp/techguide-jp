import { formatMonthLabel } from "$lib/month";

export const monthlyLetterAdminHref = "/admin/email-previews/monthly-letter";
export const monthlyLetterMaxLength = 4000;

export const defaultMonthlyLetter = (month: string): string =>
  `${formatMonthLabel(month)}も、TechGuideの業務にお力添えいただき、ありがとうございました。今後の稼働や取り組みたい仕事について、現在のご希望をお聞かせいただけると幸いです。`;
