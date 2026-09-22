import { describe, expect, it } from "vitest";
import { groupSubmissionTasks } from "../src/lib/submissionReadiness";

describe("月次確定申請までの担当者別の案内", () => {
  it("同じIssueの複数申請や別の集計元から来る未終了ログを重複表示しない", () => {
    expect(
      groupSubmissionTasks([
        "未処理の修正申請: owner/repo#22",
        "未処理の修正申請: owner/repo#22",
        "未終了ログ: owner/repo#23",
        "終了していない稼働ログ: owner/repo#23",
        "終了していない未精算予定ログ: owner/repo#24",
      ]),
    ).toEqual({
      timeReviews: ["owner/repo#22"],
      unfinishedWork: ["owner/repo#23", "owner/repo#24"],
      settlementSettings: [],
    });
  });

  it("精算設定に関する理由は省略せず管理者の確認事項として残す", () => {
    const reason = "owner/repo#22: 時間単価が未設定です。";
    expect(groupSubmissionTasks([reason, reason])).toEqual({
      timeReviews: [],
      unfinishedWork: [],
      settlementSettings: [reason],
    });
  });
});
