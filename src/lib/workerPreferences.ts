export const preferenceQuestions = {
  availabilityNote: "今後の稼働量・時期・時間帯の希望を教えてください。",
  selfAssignmentNote:
    "取り組みたい仕事や、仕事の進め方の希望を教えてください。",
  partnerInterest:
    "提携パートナー企業経由の他社業務委託案件への参画を希望しますか？",
  partnerConditions: "希望する案件の条件・関心領域を教えてください。",
} as const;

export const partnerInterestOptions = [
  { value: "interested", label: "希望する" },
  { value: "conditional", label: "条件次第で検討したい" },
  { value: "not_interested", label: "現時点では希望しない" },
] as const;
export type PartnerInterest = (typeof partnerInterestOptions)[number]["value"];
export type WorkerPreferencesInput = {
  availabilityNote: string;
  selfAssignmentNote: string;
  partnerInterest: PartnerInterest | "";
  partnerConditions: string;
  version: number;
};
export type WorkerPreferencesView = WorkerPreferencesInput & {
  updatedAt: Date | string | null;
};
export const readPreferencesInput = (
  form: FormData,
): WorkerPreferencesInput => ({
  availabilityNote: String(form.get("availabilityNote") ?? ""),
  selfAssignmentNote: String(form.get("selfAssignmentNote") ?? ""),
  partnerInterest: String(
    form.get("partnerInterest") ?? "",
  ) as WorkerPreferencesInput["partnerInterest"],
  partnerConditions: String(form.get("partnerConditions") ?? ""),
  version: Number(form.get("preferencesVersion") ?? "invalid"),
});
