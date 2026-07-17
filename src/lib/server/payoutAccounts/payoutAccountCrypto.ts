import {
  ENCRYPTION_KEY_VERSION,
  decryptJson,
  encryptJson,
} from "$lib/server/crypto/envelopeCrypto";
import type { WorkerPayoutAccountPayload } from "$lib/server/payoutAccounts/payoutAccountTypes";

export { ENCRYPTION_KEY_VERSION };

export const encryptPayload = (payload: WorkerPayoutAccountPayload): string =>
  encryptJson(payload);

export const decryptPayload = (
  encryptedPayload: string,
): WorkerPayoutAccountPayload =>
  decryptJson<WorkerPayoutAccountPayload>(encryptedPayload);
