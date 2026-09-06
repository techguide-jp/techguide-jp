import { currentJstMonth } from "$lib/month";
import { buildProjectHealth } from "$lib/server/github/projectMapper";
import {
  requiredProjectFields,
  type ProjectFieldHealth,
  type ProjectIssue,
} from "$lib/server/github/projectTypes";

type ProjectIssuesResult = {
  health: ProjectFieldHealth;
  issues: ProjectIssue[];
};

const e2eClosedAtForCurrentMonth = (): string => {
  const [year, month] = currentJstMonth().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 10, 3, 0, 0)).toISOString();
};

export const e2eProjectIssues = (): ProjectIssuesResult => {
  const issues: ProjectIssue[] = [
    {
      projectItemId: "e2e-item-open",
      repository: "techguide-jp/akademy_fes",
      number: 501,
      title: "E2E: 稼働開始と終了を確認する",
      state: "OPEN",
      url: "https://github.com/techguide-jp/akademy_fes/issues/501",
      createdAt: e2eClosedAtForCurrentMonth(),
      closedAt: null,
      assignees: ["tashua314"],
      status: "Todo",
      rewardMode: "固定",
      fixedRewardYen: 1000,
      extraCapYen: null,
      hourlyRateYen: null,
    },
    {
      projectItemId: "e2e-item-closed",
      repository: "techguide-jp/akademy_fes",
      number: 502,
      title: "E2E: 月次申請と承認を確認する",
      state: "CLOSED",
      url: "https://github.com/techguide-jp/akademy_fes/issues/502",
      createdAt: e2eClosedAtForCurrentMonth(),
      closedAt: e2eClosedAtForCurrentMonth(),
      assignees: ["tashua314"],
      status: "Done",
      rewardMode: "固定",
      fixedRewardYen: 2000,
      extraCapYen: null,
      hourlyRateYen: null,
    },
  ];

  const rewardExamples: Pick<
    ProjectIssue,
    "title" | "rewardMode" | "fixedRewardYen" | "extraCapYen" | "hourlyRateYen"
  >[] = [
    {
      title: "E2E: 固定報酬の表示確認",
      rewardMode: "固定",
      fixedRewardYen: 30000,
      extraCapYen: null,
      hourlyRateYen: null,
    },
    {
      title: "E2E: ハイブリッドの表示確認",
      rewardMode: "ハイブリッド",
      fixedRewardYen: 30000,
      extraCapYen: 15000,
      hourlyRateYen: 3000,
    },
    {
      title: "E2E: 0円の表示確認",
      rewardMode: "ハイブリッド",
      fixedRewardYen: 0,
      extraCapYen: 0,
      hourlyRateYen: 0,
    },
    {
      title: "E2E: 未設定の表示確認",
      rewardMode: "ハイブリッド",
      fixedRewardYen: null,
      extraCapYen: null,
      hourlyRateYen: null,
    },
  ];
  issues.push(
    ...rewardExamples.map((reward, index) => ({
      projectItemId: `e2e-reward-item-${index}`,
      repository: "techguide-jp/akademy_fes",
      number: 503 + index,
      state: "OPEN" as const,
      url: `https://github.com/techguide-jp/akademy_fes/issues/${503 + index}`,
      createdAt: e2eClosedAtForCurrentMonth(),
      closedAt: null,
      assignees: ["reward-worker"],
      status: "Todo",
      ...reward,
    })),
  );

  return {
    health: buildProjectHealth("E2E Project", [
      { name: requiredProjectFields.status, dataType: "SINGLE_SELECT" },
      { name: requiredProjectFields.rewardMode, dataType: "SINGLE_SELECT" },
      { name: requiredProjectFields.fixedReward, dataType: "NUMBER" },
      { name: requiredProjectFields.extraCap, dataType: "NUMBER" },
      { name: requiredProjectFields.hourlyRate, dataType: "NUMBER" },
    ]),
    issues,
  };
};
