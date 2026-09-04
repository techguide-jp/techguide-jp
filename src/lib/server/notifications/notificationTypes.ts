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
  operationId: string;
  month: string;
  assigneeLogin: string;
  workerDisplayName: string;
  occurredAt: Date;
  taxExcludedYen: number;
  taxIncludedYen: number;
  scheduledDate?: string;
  paidOn?: string;
  workerComment?: string;
  isRepeat?: boolean;
  hasPaymentNotice?: boolean;
};
