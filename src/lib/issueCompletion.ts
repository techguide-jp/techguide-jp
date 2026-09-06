/** 管理者がIssueとProjectの両方を完了にした時点で、作業者の報告は不要になる。 */
export const isIssueCompleted = (issue: {
  state: string;
  status: string | null;
}): boolean => issue.state === "CLOSED" && issue.status === "Done";
