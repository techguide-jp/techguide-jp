export const feedbackQuestions = {
  operatorComment: "運営への感想・要望・質問はありますか？",
  privateReflection:
    "対象月の取り組みを振り返って、残しておきたいことはありますか？",
} as const;
export type MonthlyFeedbackInput = {
  operatorComment: string;
  privateReflection: string;
  version: number;
};
export type MonthlyFeedbackView = {
  operatorComment: string;
  privateReflection?: string;
  version: number;
  updatedAt: Date | string | null;
};
export const readMonthlyFeedbackInput = (
  form: FormData,
): MonthlyFeedbackInput | undefined =>
  form.has("feedbackVersion")
    ? {
        operatorComment: String(form.get("operatorComment") ?? ""),
        privateReflection: String(form.get("privateReflection") ?? ""),
        version: Number(form.get("feedbackVersion")),
      }
    : undefined;
