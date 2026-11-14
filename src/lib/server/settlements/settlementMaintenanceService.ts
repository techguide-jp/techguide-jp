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
import type { SettlementNotificationInput } from "$lib/server/notifications/notificationTypes";
import { getMonthlyWorkerLetter } from "$lib/server/notifications/monthlyLetterRepository";
import { listAllWorkerProfiles } from "$lib/server/workers/workerProfileRepository";
import { normalizeNotificationLogin } from "$lib/server/notifications/contactRepository";
import { loadSettlementMonth } from "$lib/server/settlements/settlementService";
import { jstDateString } from "$lib/server/notices/noticeService";
import { env } from "$lib/server/env";

export type SettlementMaintenanceResult = {
  reconciledBase: number;
  reconciledSupplemental: number;
  remindersCreated: number;
  reminderMonth: string | null;
  adminReminderCreated: boolean;
};

const saveAndDispatchNotification = async (
  input: SettlementNotificationInput,
): Promise<boolean> => {
  const prepared = await prepareSettlementNotificationSafely(input);
  const inserted =
    prepared.mode === "preview"
      ? await insertNotificationEventMarker(input)
      : await insertPreparedNotification(prepared.write);
  if (inserted) {
    await dispatchPreparedNotification(prepared, { paceDeliveries: true });
  }
  return inserted;
};

export const runSettlementMaintenance = async (
  now = new Date(),
): Promise<SettlementMaintenanceResult> => {
  const month = currentJstMonth(now);
  const day = Number(jstDateString(now).slice(-2));
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const result: SettlementMaintenanceResult = {
    reconciledBase: 0,
    reconciledSupplemental: 0,
    remindersCreated: 0,
    reminderMonth: null,
    adminReminderCreated: false,
  };

  if (day === lastDay - 3 && env.adminGithubLogins.size > 0) {
    const sendMonth = addMonths(month, 1);
    const letter = await getMonthlyWorkerLetter(sendMonth);
    if (!letter?.body.trim()) {
      result.adminReminderCreated = await saveAndDispatchNotification({
        type: "monthly_letter_missing",
        operationId: buildNotificationOperationId(
          "monthly-letter-missing",
          sendMonth,
        ),
        month: sendMonth,
        assigneeLogin: "admin",
        workerDisplayName: "",
        occurredAt: now,
        taxExcludedYen: 0,
        taxIncludedYen: 0,
      });
    }
  }
  if (day !== 1) return result;

  const project = await fetchProjectIssuesForPage();
  if (project.projectFetchError) {
    // GitHub障害を「完了確認待ち」と誤認して既存の対象状態を後退させない。
    throw new Error(project.projectFetchError);
  }
  const reconciled = await reconcileCompletionReports(project.issues);
  const reminderMonth = addMonths(month, -1);
  const [settlement, workers, letter] = await Promise.all([
    loadSettlementMonth(reminderMonth),
    listAllWorkerProfiles(),
    getMonthlyWorkerLetter(month),
  ]);
  const settlementError =
    settlement.projectFetchError ?? settlement.settlementCalculationError;
  if (settlementError) throw new Error(settlementError);
  const submittedLogins = new Set(
    settlement.submissions.map(({ assigneeLogin }) =>
      normalizeNotificationLogin(assigneeLogin),
    ),
  );
  const approvedLogins = new Set(
    settlement.snapshots.map(({ assigneeLogin }) =>
      normalizeNotificationLogin(assigneeLogin),
    ),
  );
  const summariesByLogin = new Map(
    settlement.summaries.map((summary) => [
      normalizeNotificationLogin(summary.assigneeLogin),
      summary,
    ]),
  );
  const workersByLogin = new Map(
    workers.map((worker) => [normalizeNotificationLogin(worker.login), worker]),
  );
  let remindersCreated = 0;
  for (const [login, worker] of workersByLogin) {
    const summary = summariesByLogin.get(login);
    const monthlySubmissionStatus = approvedLogins.has(login)
      ? "approved"
      : submittedLogins.has(login)
        ? "submitted"
        : summary?.approvalRequired
          ? "required"
          : "not_required";
    const inserted = await saveAndDispatchNotification({
      type: "monthly_submission_reminder",
      // 既存の月初通知と同じキーを使い、切り替え前に配信した人への重複送信を防ぐ。
      operationId: buildNotificationOperationId(
        "monthly-submission-reminder",
        reminderMonth,
        summary?.assigneeLogin ?? worker.login,
      ),
      month: reminderMonth,
      assigneeLogin: worker.login,
      workerDisplayName: worker.displayName,
      occurredAt: now,
      taxExcludedYen: summary?.taxExcludedYen ?? 0,
      taxIncludedYen: summary?.taxIncludedYen ?? 0,
      monthlyLetterBody: letter?.body,
      monthlySubmissionStatus,
    });
    if (inserted) remindersCreated += 1;
  }

  return {
    reconciledBase: reconciled.base,
    reconciledSupplemental: reconciled.supplemental,
    remindersCreated,
    reminderMonth,
    adminReminderCreated: false,
  };
};
