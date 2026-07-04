import type { PayoutAccountType } from "$lib/server/payoutAccounts/payoutAccountTypes";

const HALF_WIDTH_KATAKANA_OFFSET = 0xfee0;
const HALF_WIDTH_KATAKANA_START = 0xff61;
const HALF_WIDTH_KATAKANA_END = 0xff9f;

export const normalizeDigits = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - HALF_WIDTH_KATAKANA_OFFSET),
    )
    .replace(/\D/g, "");

export const normalizeAccountNumber = (value: string): string =>
  normalizeDigits(value);

export const normalizeAccountHolderName = (value: string): string => {
  let normalized = value.normalize("NFKC").trim();
  normalized = normalized.replace(/[\uFF61-\uFF9F]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code === 0xff70) return "ー";
    if (code === 0xff66) return "・";
    if (code >= HALF_WIDTH_KATAKANA_START && code <= HALF_WIDTH_KATAKANA_END) {
      return String.fromCharCode(code - HALF_WIDTH_KATAKANA_OFFSET);
    }
    return char;
  });
  return normalized.replace(/\s+/g, " ").slice(0, 100);
};

export const normalizeTextField = (value: string, maxLength: number): string =>
  value.normalize("NFKC").trim().slice(0, maxLength);

export const isPayoutAccountType = (
  value: string,
): value is PayoutAccountType =>
  value === "ordinary" || value === "checking" || value === "savings";
