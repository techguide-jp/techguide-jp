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
  | { ok: false; message: string } => {
  const parsed = payoutAccountFormSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return { ok: false, message: "振込先情報の入力内容を確認してください。" };
  }

  const recipientName = normalizeTextField(parsed.data.recipientName, 100);
  const postalCode = normalizePostalCode(parsed.data.postalCode);
  const address = normalizeAddress(parsed.data.address);
  const bankName = normalizeTextField(parsed.data.bankName, 100);
  const branchName = normalizeTextField(parsed.data.branchName, 100);
  const accountNumber = normalizeAccountNumber(parsed.data.accountNumber);
  const accountHolderName = normalizeAccountHolderName(
    parsed.data.accountHolderName,
  );
  const note = normalizeTextField(parsed.data.note ?? "", 2000);

  if (!recipientName) {
    return { ok: false, message: fieldErrorMessages.recipientName };
  }
  if (!postalCode) {
    return { ok: false, message: fieldErrorMessages.postalCode };
  }
  if (!address) {
    return { ok: false, message: fieldErrorMessages.address };
  }
  if (!bankName) {
    return { ok: false, message: fieldErrorMessages.bankName };
  }
  if (!branchName) {
    return { ok: false, message: fieldErrorMessages.branchName };
  }
  if (!isPayoutAccountType(parsed.data.accountType)) {
    return { ok: false, message: fieldErrorMessages.accountType };
  }
  if (!/^\d{7}$/.test(accountNumber)) {
    return { ok: false, message: fieldErrorMessages.accountNumber };
  }
  if (
    !accountHolderName ||
    !ACCOUNT_HOLDER_NAME_PATTERN.test(accountHolderName)
  ) {
    return { ok: false, message: fieldErrorMessages.accountHolderName };
  }
  if ((parsed.data.note ?? "").length > 0 && note.length === 0) {
    return { ok: false, message: fieldErrorMessages.note };
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
      accountType: parsed.data.accountType,
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
    return emptyPayoutAccountView();
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
  | { ok: false; message: string }
> => {
  if (actorLogin !== targetLogin) {
    return { ok: false, message: "本人以外の振込先情報は更新できません。" };
  }

  const profile = await getWorkerProfile(targetLogin);
  if (!profile) {
    return { ok: false, message: "プロフィールが見つかりません。" };
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
        message:
          "他の画面で更新された可能性があります。再読み込みしてから保存してください。",
      };
    }
    return { ok: false, message: "振込先情報を保存できませんでした。" };
  }

  try {
    return {
      ok: true,
      payoutAccount: toPayoutAccountView(result.row),
    };
  } catch {
    return { ok: false, message: "振込先情報を保存できませんでした。" };
  }
};

export { emptyPayoutAccountView };
