export const WORKER_PAYOUT_ACCOUNT_ANCHOR = "payout-account";

export const workerPayoutAccountHref = (login: string): string =>
  `/workers/${encodeURIComponent(login)}#${WORKER_PAYOUT_ACCOUNT_ANCHOR}`;
