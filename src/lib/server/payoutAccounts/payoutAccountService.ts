import { z } from "zod";
import { getWorkerProfile } from "$lib/server/workers/workerProfileRepository";
import { decryptPayload } from "$lib/server/payoutAccounts/payoutAccountCrypto";
import {
  isPayoutAccountType,
  normalizeAccountHolderName,
  normalizeAccountNumber,
  normalizeAddress,
  normalizePostalCode,
  normalizeTextField,
} from "$lib/server/payoutAccounts/payoutAccountNormalization";
import {
  getPayoutAccountRow,
  listPayoutAccountStatusRows,
  upsertPayoutAccount,
} from "$lib/server/payoutAccounts/payoutAccountRepository";
import {
  PAYOUT_ACCOUNT_TYPE_LABELS,
  type WorkerPayoutAccountPayload,
  type WorkerPayoutAccountStatus,
  type WorkerPayoutAccountView,
} from "$lib/server/payoutAccounts/payoutAccountTypes";

const ACCOUNT_HOLDER_NAME_PATTERN =
  /^[\u30A0-\u30FF\u3000\u0020\u30FB\uFF08\uFF09\u0028\u0029\u002E\u002D\u002F\uFF0F]+$/;

const emptyPayoutAccountView = (version = 0): WorkerPayoutAccountView => ({
  registered: false,
  loadError: false,
  recipientName: "",
  postalCode: "",
  address: "",
  bankName: "",
  branchName: "",
  accountType: "ordinary",
  accountTypeLabel: PAYOUT_ACCOUNT_TYPE_LABELS.ordinary,
  accountNumber: "",
  accountHolderName: "",
  note: "",
  updatedBy: null,
  updatedAt: null,
  version,
});

const toPayload = (
  raw: Partial<WorkerPayoutAccountPayload>,
): WorkerPayoutAccountPayload => ({
  recipientName: raw.recipientName ?? "",
  postalCode: raw.postalCode ?? "",
  address: raw.address ?? "",
  bankName: raw.bankName ?? "",
  branchName: raw.branchName ?? "",
  accountType: raw.accountType ?? "ordinary",
  accountNumber: raw.accountNumber ?? "",
  accountHolderName: raw.accountHolderName ?? "",
  note: raw.note ?? "",
});

const toPayoutAccountView = (
  row: NonNullable<Awaited<ReturnType<typeof getPayoutAccountRow>>>,
): WorkerPayoutAccountView => {
  const payload = toPayload(
    decryptPayload(row.encryptedPayload) as Partial<WorkerPayoutAccountPayload>,
  );
  return {
    registered: true,
    loadError: false,
    recipientName: payload.recipientName,
    postalCode: payload.postalCode,
    address: payload.address,
    bankName: payload.bankName,
    branchName: payload.branchName,
    accountType: payload.accountType,
    accountTypeLabel: PAYOUT_ACCOUNT_TYPE_LABELS[payload.accountType],
    accountNumber: payload.accountNumber,
    accountHolderName: payload.accountHolderName,
    note: payload.note,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    version: row.version,
  };
};

const payoutAccountFormSchema = z.object({
  recipientName: z.string(),
  postalCode: z.string(),
  address: z.string(),
  bankName: z.string(),
  branchName: z.string(),
  accountType: z.string(),
  accountNumber: z.string(),
  accountHolderName: z.string(),
  note: z.string().optional(),
  version: z.coerce.number().int().min(0),
});

const fieldErrorMessages = {
  recipientName: "宛名（名前・屋号・会社名）を確認してください。",
  postalCode: "郵便番号は7桁の数字で入力してください。",
  address: "住所を確認してください。",
  bankName: "金融機関名を確認してください。",
  branchName: "支店名を確認してください。",
  accountType: "口座種別を確認してください。",
  accountNumber: "口座番号は7桁の数字で入力してください。",
  accountHolderName: "口座名義を全角カナで入力してください。",
  note: "補足メモの文字数を確認してください。",
} as const;

const parsePayoutAccountPayload = (
  formData: FormData,
):
  | { ok: true; payload: WorkerPayoutAccountPayload; expectedVersion: number }
  | { ok: false; messages: string[] } => {
  const parsed = payoutAccountFormSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      ok: false,
      messages: ["振込先情報の入力内容を確認してください。"],
    };
  }

  const recipientName = normalizeTextField(parsed.data.recipientName);
  const postalCode = normalizePostalCode(parsed.data.postalCode);
  const address = normalizeAddress(parsed.data.address);
  const bankName = normalizeTextField(parsed.data.bankName);
  const branchName = normalizeTextField(parsed.data.branchName);
  const accountNumber = normalizeAccountNumber(parsed.data.accountNumber);
  const accountHolderName = normalizeAccountHolderName(
    parsed.data.accountHolderName,
  );
  const note = normalizeTextField(parsed.data.note ?? "");
  const errors: string[] = [];

  if (!recipientName || recipientName.length > 100) {
    errors.push(fieldErrorMessages.recipientName);
  }
  if (!postalCode) {
    errors.push(fieldErrorMessages.postalCode);
  }
  if (!address || address.length > 500) {
    errors.push(fieldErrorMessages.address);
  }
  if (!bankName || bankName.length > 100) {
    errors.push(fieldErrorMessages.bankName);
  }
  if (!branchName || branchName.length > 100) {
    errors.push(fieldErrorMessages.branchName);
  }
  if (!isPayoutAccountType(parsed.data.accountType)) {
    errors.push(fieldErrorMessages.accountType);
  }
  if (!/^\d{7}$/.test(accountNumber)) {
    errors.push(fieldErrorMessages.accountNumber);
  }
  if (
    !accountHolderName ||
    accountHolderName.length > 100 ||
    !ACCOUNT_HOLDER_NAME_PATTERN.test(accountHolderName)
  ) {
    errors.push(fieldErrorMessages.accountHolderName);
  }
  if (note.length > 2000) {
    errors.push(fieldErrorMessages.note);
  }

  if (errors.length > 0) {
    return { ok: false, messages: errors };
  }

  return {
    ok: true,
    expectedVersion: parsed.data.version,
    payload: {
      recipientName,
      postalCode,
      address,
      bankName,
      branchName,
      accountType: parsed.data
        .accountType as WorkerPayoutAccountPayload["accountType"],
      accountNumber,
      accountHolderName,
      note,
    },
  };
};

const canViewPayoutAccount = (
  targetLogin: string,
  viewer: { login: string; isAdmin: boolean },
): boolean => viewer.isAdmin || viewer.login === targetLogin;

export const loadPayoutAccountForViewer = async (
  targetLogin: string,
  viewer: { login: string; isAdmin: boolean } | null,
): Promise<WorkerPayoutAccountView | null> => {
  if (!viewer || !canViewPayoutAccount(targetLogin, viewer)) {
    return null;
  }

  const row = await getPayoutAccountRow(targetLogin);
  if (!row) {
    return emptyPayoutAccountView();
  }

  try {
    return toPayoutAccountView(row);
  } catch {
    return {
      ...emptyPayoutAccountView(row.version),
      registered: true,
      loadError: true,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    };
  }
};

export const getPayoutAccountStatus = async (
  login: string,
): Promise<WorkerPayoutAccountStatus> => {
  const row = await getPayoutAccountRow(login);
  return {
    login,
    registered: Boolean(row),
    updatedAt: row?.updatedAt ?? null,
  };
};

export const listPayoutAccountStatuses = async (
  logins: string[],
): Promise<WorkerPayoutAccountStatus[]> => {
  const uniqueLogins = [...new Set(logins.filter(Boolean))];
  const rows = await listPayoutAccountStatusRows(uniqueLogins);
  const rowByLogin = new Map(rows.map((row) => [row.login, row]));

  return uniqueLogins.map((login) => {
    const row = rowByLogin.get(login);
    return {
      login,
      registered: Boolean(row),
      updatedAt: row?.updatedAt ?? null,
    };
  });
};

export const updateOwnPayoutAccount = async (
  formData: FormData,
  actorLogin: string,
  targetLogin: string,
): Promise<
  | { ok: true; payoutAccount: WorkerPayoutAccountView }
  | { ok: false; messages: string[] }
> => {
  if (actorLogin !== targetLogin) {
    return {
      ok: false,
      messages: ["本人以外の振込先情報は更新できません。"],
    };
  }

  const profile = await getWorkerProfile(targetLogin);
  if (!profile) {
    return { ok: false, messages: ["プロフィールが見つかりません。"] };
  }

  const parsed = parsePayoutAccountPayload(formData);
  if (!parsed.ok) {
    return parsed;
  }

  const result = await upsertPayoutAccount({
    login: targetLogin,
    payload: parsed.payload,
    updatedBy: actorLogin,
    expectedVersion: parsed.expectedVersion,
  });

  if (!result.ok) {
    if (result.reason === "conflict") {
      return {
        ok: false,
        messages: [
          "他の画面で更新された可能性があります。再読み込みしてから保存してください。",
        ],
      };
    }
    return { ok: false, messages: ["振込先情報を保存できませんでした。"] };
  }

  try {
    return {
      ok: true,
      payoutAccount: toPayoutAccountView(result.row),
    };
  } catch {
    return { ok: false, messages: ["振込先情報を保存できませんでした。"] };
  }
};

export { emptyPayoutAccountView };
