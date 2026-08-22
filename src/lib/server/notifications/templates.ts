import type {
  NotificationMessage,
  SettlementNotificationInput,
} from "$lib/server/notifications/notificationTypes";

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );

const labels = {
  settlement_submitted: "月次確定申請",
  settlement_approved: "月次精算承認",
  settlement_paid: "支払い済み登録",
} as const;

export const buildSettlementNotification = (
  input: SettlementNotificationInput,
  appOrigin: string,
  replyTo?: string,
): NotificationMessage => {
  const detailUrl = `${appOrigin.replace(/\/$/, "")}/settlements/${encodeURIComponent(input.month)}/${encodeURIComponent(input.assigneeLogin)}`;
  const repeat = input.isRepeat ? "（再処理）" : "";
  const lines = [
    `対象月: ${input.month}`,
    `対象者: ${input.workerDisplayName} (@${input.assigneeLogin})`,
  ];
  if (input.type === "settlement_submitted") {
    lines.push(`申請日時: ${input.occurredAt.toISOString()}`);
  } else if (input.type === "settlement_approved") {
    lines.push(`承認日時: ${input.occurredAt.toISOString()}`);
    if (input.scheduledDate) lines.push(`支払い予定日: ${input.scheduledDate}`);
    if (input.hasPaymentNotice) lines.push(`支払い通知書: ${detailUrl}/notice`);
  } else {
    if (input.paidOn) lines.push(`支払日: ${input.paidOn}`);
    if (input.workerComment)
      lines.push(`作業者向けコメント: ${input.workerComment}`);
  }
  lines.push(`確認する: ${detailUrl}`);
  if (!replyTo)
    lines.push(
      "このメールには返信できません。お問い合わせは管理者へお願いします。",
    );

  const subject = `【${labels[input.type]}】${input.month}${repeat}`;
  const htmlLines = lines.map((line) => {
    const urlMatch = line.match(/^(.*?): (https?:\/\/\S+)$/);
    if (urlMatch) {
      return `<p>${escapeHtml(urlMatch[1])}: <a href="${escapeHtml(urlMatch[2])}">${escapeHtml(urlMatch[2])}</a></p>`;
    }
    return `<p>${escapeHtml(line)}</p>`;
  });
  return {
    subject,
    text: `${subject}\n\n${lines.join("\n")}`,
    html: `<h1>${escapeHtml(subject)}</h1>${htmlLines.join("")}`,
  };
};
