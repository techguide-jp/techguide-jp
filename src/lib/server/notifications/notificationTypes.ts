export type NotificationType =
  | "settlement_submitted"
  | "settlement_approved"
  | "settlement_paid";

export type NotificationMessage = {
  subject: string;
  text: string;
  html: string;
};

export type SettlementNotificationInput = {
  type: NotificationType;
  month: string;
  assigneeLogin: string;
  workerDisplayName: string;
  occurredAt: Date;
  scheduledDate?: string;
  paidOn?: string;
  workerComment?: string;
  isRepeat?: boolean;
  hasPaymentNotice?: boolean;
};
