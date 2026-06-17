export const PROJECT_OWNER = "techguide-jp";
export const PROJECT_NUMBER = 7;

export const requiredProjectFields = {
  status: "Status",
  rewardMode: "報酬方式",
  fixedReward: "固定報酬額（円・税抜）",
  extraCap: "追加精算上限（円・税抜）",
  hourlyRate: "時間単価（円・税抜）"
} as const;

export type RewardMode = "固定" | "ハイブリッド";
export type ProjectStatus = "Todo" | "In Progress" | "Done" | "Reject" | string;

export type ProjectIssue = {
  projectItemId: string;
  repository: string;
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  url: string;
  createdAt: string;
  closedAt: string | null;
  assignees: string[];
  status: ProjectStatus | null;
  rewardMode: RewardMode | null;
  fixedRewardYen: number | null;
  extraCapYen: number | null;
  hourlyRateYen: number | null;
};

export type ProjectFieldHealth = {
  title: string;
  missingFields: string[];
  invalidFields: string[];
  availableFields: Array<{ name: string; dataType: string }>;
};
