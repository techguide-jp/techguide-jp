import { addMonths, currentJstMonth } from "$lib/month";
import { reconcileCompletionReports } from "$lib/server/completions/completionService";
import { fetchProjectIssuesForPage } from "$lib/server/github/projectClient";
import {
  insertNotificationEventMarker,
  insertPreparedNotification,
} from "$lib/server/notifications/notificationRepository";
import {
  dispatchPreparedNotification,
  prepareSettlementNotificationSafely,
} from "$lib/server/notifications/notificationService";
import { buildNotificationOperationId } from "$lib/server/notifications/notificationOperation";
import { loadSettlementMonth } from "$lib/server/settlements/settlementService";
import { jstDateString } from "$lib/server/notices/noticeService";

export type SettlementMaintenanceResult = {
  reconciledBase: number;
  reconciledSupplemental: number;
  remindersCreated: number;
  reminderMonth: string | null;
};

export const runSettlementMaintenance = async (
  now = new Date(),
): Promise<SettlementMaintenanceResult> => {
  const project = await fetchProjectIssuesForPage();
  if (project.projectFetchError) {
    // GitHub障害を「完了確認待ち」と誤認して既存の対象状態を後退させない。
    throw new Error(project.projectFetchError);
  }
  const reconciled = await reconcileCompletionReports(project.issues);
  const isFirstOfMonth = jstDateString(now).endsWith("-01");
  if (!isFirstOfMonth) {
    return {
      reconciledBase: reconciled.base,
      reconciledSupplemental: reconciled.supplemental,
      remindersCreated: 0,
      reminderMonth: null,
    };
  }

  const reminderMonth = addMonths(currentJstMonth(now), -1);
  const settlement = await loadSettlementMonth(reminderMonth);
  if (settlement.projectFetchError) {
    throw new Error(settlement.projectFetchError);
  }
  const submittedLogins = new Set(
    settlement.submissions.map((submission) => submission.assigneeLogin),
  );
  const targets = settlement.summaries.filter(
    (summary) =>
      summary.approvalRequired && !submittedLogins.has(summary.assigneeLogin),
  );
  let remindersCreated = 0;
  for (const summary of targets) {
    const notificationInput = {
      type: "monthly_submission_reminder",
      // 月＋作業者＋種別で固定し、Cronの重複起動でも1件だけ保存・送信する。
      operationId: buildNotificationOperationId(
        "monthly-submission-reminder",
        reminderMonth,
        summary.assigneeLogin,
      ),
      month: reminderMonth,
      assigneeLogin: summary.assigneeLogin,
      workerDisplayName: summary.assigneeLogin,
      occurredAt: now,
      taxExcludedYen: summary.taxExcludedYen,
      taxIncludedYen: summary.taxIncludedYen,
    } as const;
    const prepared =
      await prepareSettlementNotificationSafely(notificationInput);
    if (prepared.mode === "preview") {
      const inserted = await insertNotificationEventMarker(notificationInput);
      if (!inserted) continue;
      await dispatchPreparedNotification(prepared);
      remindersCreated += 1;
      continue;
    }
    const inserted = await insertPreparedNotification(prepared.write);
    if (!inserted) continue;
    await dispatchPreparedNotification(prepared);
    remindersCreated += 1;
  }

  return {
    reconciledBase: reconciled.base,
    reconciledSupplemental: reconciled.supplemental,
    remindersCreated,
    reminderMonth,
  };
};
