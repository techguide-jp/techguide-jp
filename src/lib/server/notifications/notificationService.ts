import { randomUUID } from "node:crypto";
import { dev } from "$app/environment";
import { Resend } from "resend";
import type { EmailDelivery } from "$lib/server/db/schema";
import { env } from "$lib/server/env";
import {
  listNotificationContacts,
  normalizeNotificationLogin,
} from "$lib/server/notifications/contactRepository";
import {
  claimEmailDelivery,
  getEmailDelivery,
  markDeliveryResult,
  markStaleSendingDeliveriesUnknown,
} from "$lib/server/notifications/deliveryRepository";
import type {
  PreparedDeliveryWrite,
  PreparedNotificationWrite,
} from "$lib/server/notifications/notificationWrite";
import { saveEmailPreview } from "$lib/server/notifications/previewStore";
import { buildSettlementNotification } from "$lib/server/notifications/templates";
import type { SettlementNotificationInput } from "$lib/server/notifications/notificationTypes";
import { getWorkerProfile } from "$lib/server/workers/workerProfileRepository";

type PreparedPreview = {
  mode: "preview";
  entries: Array<Parameters<typeof saveEmailPreview>[0]>;
};

export type PreparedSettlementNotification =
  | PreparedPreview
  | { mode: "resend"; write: PreparedNotificationWrite };

const recipientLogins = (input: SettlementNotificationInput): string[] =>
  input.type === "settlement_submitted"
    ? [...env.adminGithubLogins]
    : [input.assigneeLogin];

// 同じフォーム送信がHTTPレベルで再実行されても、同一イベントとしてDBで重複排除する。
export const buildNotificationEventKey = (
  input: SettlementNotificationInput,
): string =>
  [
    input.type,
    input.month,
    normalizeNotificationLogin(input.assigneeLogin),
    input.operationId,
  ].join(":");

const isLocalRuntime = (appOrigin: string): boolean => {
  try {
    return (
      dev ||
      ["localhost", "127.0.0.1", "::1"].includes(new URL(appOrigin).hostname)
    );
  } catch {
    return dev;
  }
};

export const isProductionEmailRuntime = (
  appOrigin: string,
  vercelEnvironment = env.vercelEnvironment,
): boolean =>
  vercelEnvironment
    ? vercelEnvironment === "production"
    : !isLocalRuntime(appOrigin);

export const resolveEmailRecipient = (
  syncedEmail: string | null,
  recipientOverride: string | undefined,
  productionRuntime: boolean,
): string | null =>
  productionRuntime ? syncedEmail : (recipientOverride ?? null);

const persistedIdempotencyKey = (
  deliveryId: string,
  productionRuntime: boolean,
): string =>
  `${productionRuntime ? "production" : "non-production"}/settlement-notification/${deliveryId}`;

export const prepareSettlementNotification = async (
  input: SettlementNotificationInput,
): Promise<PreparedSettlementNotification> => {
  const appOrigin = env.appOrigin ?? "http://localhost:5173";
  const productionRuntime = isProductionEmailRuntime(appOrigin);
  const logins = recipientLogins(input);
  const [profile, contacts] = await Promise.all([
    getWorkerProfile(input.assigneeLogin),
    listNotificationContacts(logins),
  ]);
  const message = buildSettlementNotification(
    {
      ...input,
      workerDisplayName: profile?.displayName ?? input.workerDisplayName,
    },
    appOrigin,
    env.emailReplyTo,
  );
  const contactByLogin = new Map(
    contacts.map((contact) => [contact.githubLogin, contact]),
  );

  if (env.emailDeliveryMode === "preview") {
    return {
      mode: "preview",
      entries: logins.map((login) => ({
        metadata: {
          type: input.type,
          month: input.month,
          assigneeLogin: input.assigneeLogin,
          recipientLogin: login,
          recipientEmail:
            contactByLogin.get(normalizeNotificationLogin(login))?.email ??
            null,
          subject: message.subject,
        },
        text: message.text,
        html: message.html,
      })),
    };
  }

  const deliveries: PreparedDeliveryWrite[] = logins.map((login) => {
    const syncedEmail =
      contactByLogin.get(normalizeNotificationLogin(login))?.email ?? null;
    const appOriginMissing = productionRuntime && !env.appOrigin;
    const recipientEmail = appOriginMissing
      ? null
      : resolveEmailRecipient(
          syncedEmail,
          env.emailRecipientOverride,
          productionRuntime,
        );
    const id = randomUUID();
    return {
      id,
      recipientLogin: login,
      recipientEmail,
      status: recipientEmail ? "pending" : "skipped",
      subject: productionRuntime
        ? message.subject
        : `[TEST] ${message.subject}`,
      textBody: message.text,
      htmlBody: message.html,
      idempotencyKey: persistedIdempotencyKey(id, productionRuntime),
      errorCode: recipientEmail
        ? null
        : appOriginMissing
          ? "app_origin_not_configured"
          : !productionRuntime
            ? "non_production_recipient_override_required"
            : "recipient_not_synced",
    };
  });
  return {
    mode: "resend",
    write: {
      eventId: randomUUID(),
      eventKey: buildNotificationEventKey(input),
      type: input.type,
      month: input.month,
      assigneeLogin: input.assigneeLogin,
      occurredAt: input.occurredAt,
      payloadJson: JSON.stringify({
        scheduledDate: input.scheduledDate,
        paidOn: input.paidOn,
        isRepeat: input.isRepeat,
        hasPaymentNotice: input.hasPaymentNotice,
      }),
      deliveries,
    },
  };
};

export const prepareSettlementNotificationSafely = async (
  input: SettlementNotificationInput,
): Promise<PreparedSettlementNotification> => {
  try {
    return await prepareSettlementNotification(input);
  } catch {
    if (env.emailDeliveryMode === "preview") {
      return { mode: "preview", entries: [] };
    }
    const appOrigin = env.appOrigin ?? "http://localhost:5173";
    const productionRuntime = isProductionEmailRuntime(appOrigin);
    const deliveries: PreparedDeliveryWrite[] = recipientLogins(input).map(
      (recipientLogin) => {
        const id = randomUUID();
        return {
          id,
          recipientLogin,
          recipientEmail: null,
          status: "skipped",
          subject: `【通知生成失敗】${input.month}`,
          textBody: "通知内容を生成できなかったため送信していません。",
          htmlBody: "<p>通知内容を生成できなかったため送信していません。</p>",
          idempotencyKey: persistedIdempotencyKey(id, productionRuntime),
          errorCode: "notification_preparation_failed",
        };
      },
    );
    return {
      mode: "resend",
      write: {
        eventId: randomUUID(),
        eventKey: buildNotificationEventKey(input),
        type: input.type,
        month: input.month,
        assigneeLogin: input.assigneeLogin,
        occurredAt: input.occurredAt,
        payloadJson: JSON.stringify({ preparationFailed: true }),
        deliveries,
      },
    };
  }
};

export const classifyResendError = (errorName: string): "failed" | "unknown" =>
  new Set([
    "application_error",
    "internal_server_error",
    "concurrent_idempotent_requests",
    "invalid_idempotent_request",
  ]).has(errorName)
    ? "unknown"
    : "failed";

const sendClaimedDelivery = async (delivery: EmailDelivery): Promise<void> => {
  if (delivery.status !== "sending" || !delivery.recipientEmail) return;
  if (!env.resendApiKey || !env.emailFrom) {
    await markDeliveryResult({
      id: delivery.id,
      status: "failed",
      errorCode: "resend_not_configured",
    });
    return;
  }
  const recipientEmail = delivery.recipientEmail;
  try {
    const result = await new Resend(env.resendApiKey).emails.send(
      {
        from: env.emailFrom,
        to: recipientEmail,
        subject: delivery.subject,
        text: delivery.textBody,
        html: delivery.htmlBody,
        ...(env.emailReplyTo ? { replyTo: env.emailReplyTo } : {}),
      },
      {
        idempotencyKey: delivery.idempotencyKey,
      },
    );
    if (result.error) {
      await markDeliveryResult({
        id: delivery.id,
        status: classifyResendError(result.error.name),
        errorCode: result.error.name,
      });
      return;
    }
    await markDeliveryResult({
      id: delivery.id,
      status: "accepted",
      resendEmailId: result.data?.id,
    });
  } catch {
    await markDeliveryResult({
      id: delivery.id,
      status: "unknown",
      errorCode: "transport_unknown",
    });
  }
};

const dispatchPersistedDelivery = async (
  id: string,
  expectedStatus: "pending" | "failed",
): Promise<boolean> => {
  const claimed = await claimEmailDelivery(id, expectedStatus);
  if (!claimed) return false;
  await sendClaimedDelivery(claimed);
  return true;
};

export const dispatchPreparedNotification = async (
  prepared: PreparedSettlementNotification,
): Promise<void> => {
  try {
    if (prepared.mode === "preview") {
      await Promise.all(prepared.entries.map(saveEmailPreview));
      return;
    }
    await Promise.all(
      prepared.write.deliveries.map(async (candidate) => {
        await dispatchPersistedDelivery(candidate.id, "pending");
      }),
    );
  } catch (error) {
    // 通知障害は、確定済みの精算操作を失敗させない。
    console.error("Email notification dispatch deferred", error);
  }
};

export const retryEmailDelivery = async (
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const delivery = await getEmailDelivery(id);
  if (
    !delivery ||
    (delivery.status !== "pending" && delivery.status !== "failed") ||
    !delivery.recipientEmail
  ) {
    return { ok: false, message: "安全に再試行できる配送ではありません。" };
  }
  if (!env.resendApiKey || !env.emailFrom) {
    return { ok: false, message: "Resend の設定が不足しています。" };
  }
  if (
    !isProductionEmailRuntime(env.appOrigin ?? "http://localhost:5173") &&
    !env.emailRecipientOverride
  ) {
    return { ok: false, message: "非本番の実送信には宛先上書きが必要です。" };
  }
  const claimed = await dispatchPersistedDelivery(delivery.id, delivery.status);
  if (!claimed) {
    return { ok: false, message: "別の処理が送信を開始しています。" };
  }
  const updated = await getEmailDelivery(id);
  if (updated?.status === "accepted") return { ok: true };
  return updated?.status === "unknown"
    ? {
        ok: false,
        message: "送信結果を確認できません。自動再送しないでください。",
      }
    : { ok: false, message: "Resend が送信を拒否しました。" };
};

const STALE_SENDING_MINUTES = 15;

export const reconcileStaleEmailDeliveries = async (): Promise<number> => {
  // Resend到達後に応答だけ失われた可能性があるため、自動再送せず要確認に固定する。
  const staleBefore = new Date(Date.now() - STALE_SENDING_MINUTES * 60 * 1000);
  return markStaleSendingDeliveriesUnknown(staleBefore);
};
