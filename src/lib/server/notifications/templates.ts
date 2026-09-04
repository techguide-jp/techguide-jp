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

const formatMonth = (month: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? `${match[1]}年${Number(match[2])}月分` : month;
};

const formatDate = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match
    ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日`
    : date;
};

const formatJstDateTime = (date: Date): string =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

const formatYen = (amount: number): string =>
  `${new Intl.NumberFormat("ja-JP").format(amount)}円`;

type EmailContent = {
  subject: string;
  greeting: string;
  appreciation?: string;
  introduction: string;
  actionLabel: string;
  details: Array<{ label: string; value: string }>;
};

const buildEmailContent = (
  input: SettlementNotificationInput,
): EmailContent => {
  const month = formatMonth(input.month);
  const repeat = input.isRepeat
    ? input.type === "settlement_submitted"
      ? "（再申請）"
      : input.type === "settlement_approved"
        ? "（再承認）"
        : "（再処理）"
    : "";
  const amountDetails = [
    { label: "精算額（税抜）", value: formatYen(input.taxExcludedYen) },
    { label: "支払金額（税込）", value: formatYen(input.taxIncludedYen) },
  ];

  if (input.type === "settlement_submitted") {
    return {
      subject: `【要確認】${input.workerDisplayName}さんが${month}の月次確定申請を提出しました${repeat}`,
      greeting: "TechGuide管理者のみなさま",
      introduction: `${input.workerDisplayName}さんから${month}の月次確定申請が届きました。内容を確認し、承認手続きをお願いします。`,
      actionLabel: "申請内容を確認・承認する",
      details: [
        { label: "対象月", value: month },
        {
          label: "申請者",
          value: `${input.workerDisplayName} (@${input.assigneeLogin})`,
        },
        ...amountDetails,
        { label: "申請日時", value: formatJstDateTime(input.occurredAt) },
      ],
    };
  }

  if (input.type === "settlement_approved") {
    return {
      subject: `【TechGuide】${month}の月次精算が承認されました${repeat}`,
      greeting: `${input.workerDisplayName}さん`,
      appreciation:
        "今月もTechGuideの業務にお力添えいただき、ありがとうございます。",
      introduction: `${month}の月次精算が承認されました。支払金額と支払い予定日をご確認ください。`,
      actionLabel: "精算内容を確認する",
      details: [
        { label: "対象月", value: month },
        ...amountDetails,
        ...(input.scheduledDate
          ? [
              {
                label: "支払い予定日",
                value: formatDate(input.scheduledDate),
              },
            ]
          : []),
        { label: "承認日時", value: formatJstDateTime(input.occurredAt) },
      ],
    };
  }

  return {
    subject: `【TechGuide】${month}のお支払いが完了しました${repeat}`,
    greeting: `${input.workerDisplayName}さん`,
    appreciation:
      "今月もTechGuideの業務にお力添えいただき、ありがとうございました。",
    introduction: `${month}のお支払いが完了しました。支払内容をご確認ください。`,
    actionLabel: "支払い内容を確認する",
    details: [
      { label: "対象月", value: month },
      ...amountDetails,
      ...(input.paidOn
        ? [{ label: "支払日", value: formatDate(input.paidOn) }]
        : []),
      ...(input.workerComment
        ? [{ label: "管理者からのコメント", value: input.workerComment }]
        : []),
    ],
  };
};

export const buildSettlementNotification = (
  input: SettlementNotificationInput,
  appOrigin: string,
  replyTo?: string,
): NotificationMessage => {
  const detailUrl = `${appOrigin.replace(/\/$/, "")}/settlements/${encodeURIComponent(input.month)}/${encodeURIComponent(input.assigneeLogin)}`;
  const noticeUrl = `${detailUrl}/notice`;
  const content = buildEmailContent(input);
  const textDetails = content.details
    .map(({ label, value }) => `${label}: ${value}`)
    .join("\n");
  const noticeText = input.hasPaymentNotice
    ? `\n支払い通知書を確認する\n${noticeUrl}\n`
    : "";
  const replyText = replyTo
    ? "ご不明な点は、このメールへの返信でお問い合わせください。"
    : "このメールには返信できません。お問い合わせは管理者へお願いします。";
  const text = [
    `${content.greeting}\n`,
    content.appreciation,
    content.introduction,
    textDetails,
    `${content.actionLabel}\n${detailUrl}`,
    noticeText.trim(),
    replyText,
    "※このメールはTechGuideの稼働精算システムから自動送信されています。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const htmlDetails = content.details
    .map(
      ({ label, value }) =>
        `<tr><th style="padding:10px 12px;text-align:left;color:#52606d;font-size:13px;font-weight:600;border-bottom:1px solid #e8edf2;white-space:nowrap;">${escapeHtml(label)}</th><td style="padding:10px 12px;color:#172b4d;font-size:14px;border-bottom:1px solid #e8edf2;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const noticeHtml = input.hasPaymentNotice
    ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(noticeUrl)}" style="color:#0052cc;font-size:14px;font-weight:600;">支払い通知書を確認する</a></p>`
    : "";
  const appreciationHtml = content.appreciation
    ? `<p style="margin:0 0 16px;font-size:15px;">${escapeHtml(content.appreciation)}</p>`
    : "";
  const html = `<div style="margin:0 auto;max-width:640px;padding:32px 24px;color:#172b4d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;"><p style="margin:0 0 20px;font-size:15px;">${escapeHtml(content.greeting)}</p><h1 style="margin:0 0 16px;font-size:22px;line-height:1.4;">${escapeHtml(content.subject)}</h1>${appreciationHtml}<p style="margin:0 0 24px;font-size:15px;">${escapeHtml(content.introduction)}</p><table role="presentation" style="width:100%;margin:0 0 24px;border-collapse:collapse;background:#f8fafc;border:1px solid #e8edf2;border-radius:8px;">${htmlDetails}</table><p style="margin:0;"><a href="${escapeHtml(detailUrl)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#0052cc;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${escapeHtml(content.actionLabel)}</a></p>${noticeHtml}<hr style="margin:28px 0 20px;border:0;border-top:1px solid #e8edf2;"><p style="margin:0 0 8px;color:#52606d;font-size:13px;">${escapeHtml(replyText)}</p><p style="margin:0;color:#7a869a;font-size:12px;">※このメールはTechGuideの稼働精算システムから自動送信されています。</p></div>`;

  return {
    subject: content.subject,
    text,
    html,
  };
};
