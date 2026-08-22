import { randomUUID } from "node:crypto";
import { dev } from "$app/environment";
import { Resend } from "resend";
import { env } from "$lib/server/env";
import { listNotificationContacts } from "$lib/server/notifications/contactRepository";
import {
  getEmailDelivery,
  markDeliveryResult,
  markDeliverySending,
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

const eventKey = (input: SettlementNotificationInput): string =>
  [
    input.type,
    input.month,
    input.assigneeLogin,
    input.occurredAt.toISOString(),
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

export const prepareSettlementNotification = async (
  input: SettlementNotificationInput,
): Promise<PreparedSettlementNotification> => {
  const appOrigin = env.appOrigin ?? "http://localhost:5173";
  const localRuntime = isLocalRuntime(appOrigin);
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
          recipientEmail: contactByLogin.get(login)?.email ?? null,
          subject: message.subject,
        },
        text: message.text,
        html: message.html,
      })),
    };
  }

  const deliveries: PreparedDeliveryWrite[] = logins.map((login) => {
    const syncedEmail = contactByLogin.get(login)?.email ?? null;
    const appOriginMissing = !localRuntime && !env.appOrigin;
    const recipientEmail = appOriginMissing
      ? null
      : localRuntime
        ? (env.emailRecipientOverride ?? null)
        : syncedEmail;
    const id = randomUUID();
    return {
      id,
      recipientLogin: login,
      recipientEmail,
      status: recipientEmail ? "pending" : "skipped",
      subject: localRuntime ? `[LOCAL] ${message.subject}` : message.subject,
      textBody: message.text,
      htmlBody: message.html,
      idempotencyKey: `settlement-notification/${id}`,
      errorCode: recipientEmail
        ? null
        : appOriginMissing
          ? "app_origin_not_configured"
          : localRuntime
            ? "local_recipient_override_required"
            : "recipient_not_synced",
    };
  });
  return {
    mode: "resend",
    write: {
      eventId: randomUUID(),
      eventKey: eventKey(input),
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
          idempotencyKey: `settlement-notification/${id}`,
          errorCode: "notification_preparation_failed",
        };
      },
    );
    return {
      mode: "resend",
      write: {
        eventId: randomUUID(),
        eventKey: eventKey(input),
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
  new Set(["application_error", "internal_server_error", "conflict"]).has(
    errorName,
  )
    ? "unknown"
    : "failed";

const sendDelivery = async (delivery: PreparedDeliveryWrite): Promise<void> => {
  if (delivery.status !== "pending" || !delivery.recipientEmail) return;
  if (!env.resendApiKey || !env.emailFrom) {
    await markDeliveryResult({
      id: delivery.id,
      status: "failed",
      errorCode: "resend_not_configured",
    });
    return;
  }
  const localRuntime = isLocalRuntime(env.appOrigin ?? "http://localhost:5173");
  await markDeliverySending(delivery.id);
  try {
    const result = await new Resend(env.resendApiKey).emails.send(
      {
        from: env.emailFrom,
        to: delivery.recipientEmail,
        subject: delivery.subject,
        text: delivery.textBody,
        html: delivery.htmlBody,
        ...(env.emailReplyTo ? { replyTo: env.emailReplyTo } : {}),
      },
      {
        idempotencyKey: `${localRuntime ? "local/" : "production/"}${delivery.idempotencyKey}`,
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
        const persisted = await getEmailDelivery(candidate.id);
        if (persisted?.status !== "pending" || !persisted.recipientEmail)
          return;
        await sendDelivery({
          id: persisted.id,
          recipientLogin: persisted.recipientLogin,
          recipientEmail: persisted.recipientEmail,
          status: "pending",
          subject: persisted.subject,
          textBody: persisted.textBody,
          htmlBody: persisted.htmlBody,
          idempotencyKey: persisted.idempotencyKey,
          errorCode: persisted.errorCode,
        });
      }),
    );
  } catch {
    // 通知障害は、確定済みの精算操作を失敗させない。
  }
};

export const retryFailedDelivery = async (
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const delivery = await getEmailDelivery(id);
  if (!delivery || delivery.status !== "failed" || !delivery.recipientEmail) {
    return { ok: false, message: "安全に再試行できる配送ではありません。" };
  }
  if (Date.now() - delivery.createdAt.getTime() > 24 * 60 * 60 * 1000) {
    return {
      ok: false,
      message: "24時間を超えた配送は Resend 側の状況確認が必要です。",
    };
  }
  if (!env.resendApiKey || !env.emailFrom) {
    return { ok: false, message: "Resend の設定が不足しています。" };
  }
  if (
    isLocalRuntime(env.appOrigin ?? "http://localhost:5173") &&
    !env.emailRecipientOverride
  ) {
    return { ok: false, message: "ローカル実送信には宛先上書きが必要です。" };
  }
  await sendDelivery({
    id: delivery.id,
    recipientLogin: delivery.recipientLogin,
    recipientEmail: delivery.recipientEmail,
    status: "pending",
    subject: delivery.subject,
    textBody: delivery.textBody,
    htmlBody: delivery.htmlBody,
    idempotencyKey: delivery.idempotencyKey,
    errorCode: delivery.errorCode,
  });
  const updated = await getEmailDelivery(id);
  if (updated?.status === "accepted") return { ok: true };
  return updated?.status === "unknown"
    ? {
        ok: false,
        message: "送信結果を確認できません。自動再送しないでください。",
      }
    : { ok: false, message: "Resend が送信を拒否しました。" };
};
