export const groupSubmissionTasks = (reasons: string[]) => {
  const timeReviews = new Set<string>();
  const unfinishedWork = new Set<string>();
  const settlementSettings = new Set<string>();
  // 既存の精算・スナップショットの理由は変えず、画面で担当者と次の操作に整理する。
  for (const reason of reasons) {
    if (reason.startsWith("未処理の修正申請: ")) {
      timeReviews.add(reason.slice("未処理の修正申請: ".length));
    } else if (
      /^(未終了ログ|終了していない稼働ログ|終了していない未精算予定ログ): /.test(
        reason,
      )
    ) {
      unfinishedWork.add(reason.slice(reason.indexOf(": ") + 2));
    } else {
      settlementSettings.add(reason);
    }
  }
  return {
    timeReviews: [...timeReviews],
    unfinishedWork: [...unfinishedWork],
    settlementSettings: [...settlementSettings],
  };
};
