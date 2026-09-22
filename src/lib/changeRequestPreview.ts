import type { TimedRewardCalculation } from "$lib/timedReward";

export type PreviewAmounts = {
  fixedRewardYen: number;
  timedRewardYen: number;
  taxExcludedYen: number;
  taxIncludedYen: number;
};

export type ChangeRequestPreviewMonth = {
  month: string;
  before: PreviewAmounts;
  after: PreviewAmounts;
  approved: boolean;
  issueDetail: {
    workMinutes: number;
    hourlyRateYen: number | null;
    timedRewardYen: number;
    calculation?: TimedRewardCalculation;
  } | null;
};

export type ChangeRequestPreview = {
  requestId: string;
  months: ChangeRequestPreviewMonth[];
  notes: string[];
  error: string | null;
};
