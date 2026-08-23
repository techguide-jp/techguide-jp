import { env } from "$lib/server/env";
import { defaultPaymentDueDate } from "$lib/server/payments/paymentDate";
import { getNotificationContact } from "$lib/server/notifications/contactRepository";
import { createNotificationOperationId } from "$lib/server/notifications/notificationOperation";
import { saveEmailPreview } from "$lib/server/notifications/previewStore";
import { buildSettlementNotification } from "$lib/server/notifications/templates";
import type {
  NotificationType,
  SettlementNotificationInput,
} from "$lib/server/notifications/notificationTypes";
import { toJstMonth } from "$lib/server/time";
import { getWorkerProfile } from "$lib/server/workers/workerProfileRepository";

const notificationTypes = new Set<NotificationType>([
  "settlement_submitted",
  "settlement_approved",
  "settlement_paid",
]);

export const isNotificationType = (value: string): value is NotificationType =>
  notificationTypes.has(value as NotificationType);

const toJstDate = (date: Date): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export const createTestEmailPreview = async (
  type: NotificationType,
  actorLogin: string,
  requestOrigin: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (env.emailDeliveryMode !== "preview") {
    return {
      ok: false,
      message: "動作確認用プレビューはPreviewモードでのみ生成できます。",
    };
  }

  const now = new Date();
  const month = toJstMonth(now);
  const [profile, contact] = await Promise.all([
    getWorkerProfile(actorLogin),
    getNotificationContact(actorLogin),
  ]);
  const input: SettlementNotificationInput = {
    type,
    operationId: createNotificationOperationId(),
    month,
    assigneeLogin: actorLogin,
    workerDisplayName: profile?.displayName ?? actorLogin,
    occurredAt: now,
    ...(type === "settlement_approved"
      ? {
          scheduledDate: defaultPaymentDueDate(month),
          hasPaymentNotice: true,
        }
      : {}),
    ...(type === "settlement_paid" ? { paidOn: toJstDate(now) } : {}),
  };
  const message = buildSettlementNotification(
    input,
    requestOrigin,
    env.emailReplyTo,
  );

  // 動作確認では業務レコードや配送履歴を作らず、管理者本人宛てのローカルファイルだけを作る。
  await saveEmailPreview({
    metadata: {
      type,
      month,
      assigneeLogin: actorLogin,
      recipientLogin: actorLogin,
      recipientEmail: contact?.email ?? null,
      subject: `[動作確認] ${message.subject}`,
    },
    text: message.text,
    html: message.html,
  });
  return { ok: true };
};
