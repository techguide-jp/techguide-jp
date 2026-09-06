import { formatYen } from "$lib/format";
import type { SettlementSummary } from "$lib/server/settlements/settlementTypes";

export const settlementAmountLabel = (
  summary: SettlementSummary,
  key:
    | "fixedRewardYen"
    | "timedRewardYen"
    | "taxExcludedYen"
    | "taxIncludedYen",
): string =>
  summary.dataSource === "unavailable"
    ? "確認できません"
    : formatYen(summary[key]);

export const settlementSourceLabel = (
  summary: SettlementSummary,
): string | null => {
  switch (summary.dataSource) {
    case "approved":
      return "承認時点の保存結果を表示しています。最新状態は確認できません。";
    case "submitted":
      return "申請時点の保存結果を表示しています。最新状態は確認できません。";
    case "unavailable":
      return "保存済みの精算結果がないか復元できないため、金額を確認できません。";
    default:
      return null;
  }
};
