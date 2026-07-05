export type PayoutAccountType = "ordinary" | "checking" | "savings";

export type WorkerPayoutAccountPayload = {
  recipientName: string;
  postalCode: string;
  address: string;
  bankName: string;
  branchName: string;
  accountType: PayoutAccountType;
  accountNumber: string;
  accountHolderName: string;
  note: string;
};

export type WorkerPayoutAccountView = {
  registered: boolean;
  recipientName: string;
  postalCode: string;
  address: string;
  bankName: string;
  branchName: string;
  accountType: PayoutAccountType;
  accountTypeLabel: string;
  accountNumber: string;
  accountHolderName: string;
  note: string;
  updatedBy: string | null;
  updatedAt: Date | null;
  version: number;
};

export type WorkerPayoutAccountStatus = {
  login: string;
  registered: boolean;
  updatedAt: Date | null;
};

export const PAYOUT_ACCOUNT_TYPE_LABELS: Record<PayoutAccountType, string> = {
  ordinary: "普通",
  checking: "当座",
  savings: "貯蓄",
};
