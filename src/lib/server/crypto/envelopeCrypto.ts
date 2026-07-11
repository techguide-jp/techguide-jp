import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env, requireEnv } from "$lib/server/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
export const ENCRYPTION_KEY_VERSION = 1;

type EncryptedEnvelope = {
  v: number;
  data: string;
};

const loadEncryptionKey = (): Buffer => {
  const encoded = requireEnv(
    env.payoutAccountEncryptionKey,
    "PAYOUT_ACCOUNT_ENCRYPTION_KEY",
  );
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("PAYOUT_ACCOUNT_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
};

/** 任意の JSON 値を AES-256-GCM で暗号化し、封筒 JSON 文字列を返す。 */
export const encryptJson = (payload: unknown): string => {
  const key = loadEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const envelope: EncryptedEnvelope = {
    v: ENCRYPTION_KEY_VERSION,
    data: Buffer.concat([iv, authTag, encrypted]).toString("base64"),
  };
  return JSON.stringify(envelope);
};

/** 封筒 JSON 文字列を復号して JSON 値へ戻す。復号失敗時は例外を投げる。 */
export const decryptJson = <T>(encryptedPayload: string): T => {
  const key = loadEncryptionKey();
  const envelope = JSON.parse(encryptedPayload) as EncryptedEnvelope;
  if (envelope.v !== ENCRYPTION_KEY_VERSION) {
    throw new Error("Unsupported encryption version");
  }
  const combined = Buffer.from(envelope.data, "base64");
  if (combined.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid ciphertext");
  }
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
};
