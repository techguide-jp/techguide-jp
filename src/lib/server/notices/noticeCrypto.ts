import { decryptJson, encryptJson } from "$lib/server/crypto/envelopeCrypto";
import type { NoticeRecipient } from "$lib/server/notices/noticeTypes";

/** 通知書用の作業者宛先を暗号化する。宛名・郵便番号・住所のみを扱う。 */
export const encryptNoticeRecipient = (recipient: NoticeRecipient): string =>
  encryptJson({
    recipientName: recipient.recipientName,
    postalCode: recipient.postalCode,
    address: recipient.address,
  });

/** 通知書用の作業者宛先を復号する。復号失敗時は例外を投げる。 */
export const decryptNoticeRecipient = (
  encryptedPayload: string,
): NoticeRecipient => {
  const raw = decryptJson<Partial<NoticeRecipient>>(encryptedPayload);
  return {
    recipientName: raw.recipientName ?? "",
    postalCode: raw.postalCode ?? "",
    address: raw.address ?? "",
  };
};
