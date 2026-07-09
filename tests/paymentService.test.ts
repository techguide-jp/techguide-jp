import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonthlyPayment } from "$lib/server/db/schema";
import {
  getPaymentRow,
  listPaymentRowsForMonth,
  upsertPaymentPaid,
  upsertPaymentScheduledDate,
  upsertPaymentUnpaid,
} from "$lib/server/payments/paymentRepository";
import {
  defaultPaymentDueDate,
  getPaymentForViewer,
  listPaymentViewsForMonth,
  markSettlementPaid,
  normalizeDateInput,
  revertSettlementPayment,
  updatePaymentScheduledDate,
} from "$lib/server/payments/paymentService";
import { validateSettlementPaymentEligibility } from "$lib/server/settlements/settlementService";

vi.mock("$lib/server/payments/paymentRepository", () => ({
  getPaymentRow: vi.fn(),
  listPaymentRowsForMonth: vi.fn(),
  upsertPaymentPaid: vi.fn(),
  upsertPaymentUnpaid: vi.fn(),
  upsertPaymentScheduledDate: vi.fn(),
}));

vi.mock("$lib/server/settlements/settlementService", () => ({
  validateSettlementPaymentEligibility: vi.fn(),
}));

const paymentRow = (
  overrides: Partial<MonthlyPayment> = {},
): MonthlyPayment => ({
  month: "2026-06",
  assigneeLogin: "tashua314",
  status: "unpaid",
  scheduledDate: null,
  paidOn: null,
  createdAt: new Date("2026-06-18T00:00:00Z"),
  updatedAt: new Date("2026-06-18T00:00:00Z"),
  ...overrides,
});

const admin = { login: "admin", isAdmin: true };
const self = { login: "tashua314", isAdmin: false };
const other = { login: "someoneelse", isAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPaymentRow).mockResolvedValue(null);
  vi.mocked(validateSettlementPaymentEligibility).mockResolvedValue({
    ok: true,
  });
  vi.mocked(listPaymentRowsForMonth).mockResolvedValue([]);
  vi.mocked(upsertPaymentPaid).mockImplementation(async (input) =>
    paymentRow({ ...input, status: "paid" }),
  );
  vi.mocked(upsertPaymentUnpaid).mockImplementation(async (input) =>
    paymentRow({ ...input, status: "unpaid", paidOn: null }),
  );
  vi.mocked(upsertPaymentScheduledDate).mockImplementation(async (input) =>
    paymentRow({ ...input }),
  );
});

describe("defaultPaymentDueDate", () => {
  it("対象月の翌月14日を返す", () => {
    expect(defaultPaymentDueDate("2026-06")).toBe("2026-07-14");
    expect(defaultPaymentDueDate("2026-12")).toBe("2027-01-14");
  });

  it("不正な月は空文字を返す", () => {
    expect(defaultPaymentDueDate("2026-13")).toBe("");
  });
});

describe("normalizeDateInput", () => {
  it("実在する日付を正規化する", () => {
    expect(normalizeDateInput(" 2026-07-14 ")).toBe("2026-07-14");
  });

  it("形式や実在しない日付は null", () => {
    expect(normalizeDateInput("2026/07/14")).toBeNull();
    expect(normalizeDateInput("2026-02-30")).toBeNull();
    expect(normalizeDateInput("")).toBeNull();
  });
});

describe("getPaymentForViewer", () => {
  it("本人は自分の支払い情報を閲覧できる", async () => {
    const view = await getPaymentForViewer("2026-06", "tashua314", self);
    expect(view).not.toBeNull();
    expect(view?.status).toBe("unpaid");
  });

  it("管理者は他者の支払い情報を閲覧できる", async () => {
    const view = await getPaymentForViewer("2026-06", "tashua314", admin);
    expect(view).not.toBeNull();
  });

  it("他人は閲覧できず null", async () => {
    const view = await getPaymentForViewer("2026-06", "tashua314", other);
    expect(view).toBeNull();
    expect(getPaymentRow).not.toHaveBeenCalled();
  });

  it("未ログインは null", async () => {
    const view = await getPaymentForViewer("2026-06", "tashua314", null);
    expect(view).toBeNull();
  });

  it("個別未設定なら翌月14日をデフォルト表示する", async () => {
    const view = await getPaymentForViewer("2026-06", "tashua314", self);
    expect(view?.scheduledDate).toBe("2026-07-14");
    expect(view?.scheduledDateIsDefault).toBe(true);
  });

  it("個別設定があればそれを表示する", async () => {
    vi.mocked(getPaymentRow).mockResolvedValue(
      paymentRow({ scheduledDate: "2026-07-20" }),
    );
    const view = await getPaymentForViewer("2026-06", "tashua314", self);
    expect(view?.scheduledDate).toBe("2026-07-20");
    expect(view?.scheduledDateIsDefault).toBe(false);
  });
});

describe("listPaymentViewsForMonth", () => {
  it("assignee ごとにデフォルト予定日込みでビューを返す", async () => {
    vi.mocked(listPaymentRowsForMonth).mockResolvedValue([
      paymentRow({ assigneeLogin: "a", status: "paid", paidOn: "2026-07-10" }),
    ]);
    const views = await listPaymentViewsForMonth("2026-06", ["a", "b"]);
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({
      assigneeLogin: "a",
      status: "paid",
      paidOn: "2026-07-10",
    });
    expect(views[1]).toMatchObject({
      assigneeLogin: "b",
      status: "unpaid",
      scheduledDate: "2026-07-14",
      scheduledDateIsDefault: true,
    });
  });
});

describe("markSettlementPaid", () => {
  it("有効な支払日で支払い済みにする", async () => {
    const result = await markSettlementPaid(
      "2026-06",
      "tashua314",
      "2026-07-14",
    );
    expect(result).toMatchObject({ ok: true });
    expect(upsertPaymentPaid).toHaveBeenCalledWith({
      month: "2026-06",
      assigneeLogin: "tashua314",
      paidOn: "2026-07-14",
    });
  });

  it("不正な支払日はエラー", async () => {
    const result = await markSettlementPaid("2026-06", "tashua314", "invalid");
    expect(result).toMatchObject({ ok: false });
    expect(upsertPaymentPaid).not.toHaveBeenCalled();
  });

  it("未承認の精算は支払い済みにできない", async () => {
    vi.mocked(validateSettlementPaymentEligibility).mockResolvedValue({
      ok: false,
      message: "未承認の月次精算は支払い情報を更新できません。",
    });

    const result = await markSettlementPaid(
      "2026-06",
      "tashua314",
      "2026-07-14",
    );

    expect(result).toMatchObject({ ok: false });
    expect(upsertPaymentPaid).not.toHaveBeenCalled();
  });
});

describe("revertSettlementPayment", () => {
  it("未処理に戻す", async () => {
    vi.mocked(getPaymentRow).mockResolvedValue(
      paymentRow({ status: "paid", paidOn: "2026-07-14" }),
    );
    const result = await revertSettlementPayment("2026-06", "tashua314");
    expect(result).toMatchObject({ ok: true });
    expect(upsertPaymentUnpaid).toHaveBeenCalledWith({
      month: "2026-06",
      assigneeLogin: "tashua314",
    });
  });

  it("支払い済みレコードがなければ未処理レコードを作らない", async () => {
    const result = await revertSettlementPayment("2026-06", "tashua314");

    expect(result).toMatchObject({ ok: false });
    expect(upsertPaymentUnpaid).not.toHaveBeenCalled();
  });
});

describe("updatePaymentScheduledDate", () => {
  it("有効な日付を保存する", async () => {
    const result = await updatePaymentScheduledDate(
      "2026-06",
      "tashua314",
      "2026-07-20",
    );
    expect(result).toMatchObject({ ok: true });
    expect(upsertPaymentScheduledDate).toHaveBeenCalledWith({
      month: "2026-06",
      assigneeLogin: "tashua314",
      scheduledDate: "2026-07-20",
    });
  });

  it("空欄はデフォルトに戻す（null保存）", async () => {
    const result = await updatePaymentScheduledDate("2026-06", "tashua314", "");
    expect(result).toMatchObject({ ok: true });
    expect(upsertPaymentScheduledDate).toHaveBeenCalledWith({
      month: "2026-06",
      assigneeLogin: "tashua314",
      scheduledDate: null,
    });
  });

  it("不正な日付はエラー", async () => {
    const result = await updatePaymentScheduledDate(
      "2026-06",
      "tashua314",
      "2026-99-99",
    );
    expect(result).toMatchObject({ ok: false });
    expect(upsertPaymentScheduledDate).not.toHaveBeenCalled();
  });

  it("未承認の精算は予定日を保存できない", async () => {
    vi.mocked(validateSettlementPaymentEligibility).mockResolvedValue({
      ok: false,
      message: "未承認の月次精算は支払い情報を更新できません。",
    });

    const result = await updatePaymentScheduledDate(
      "2026-06",
      "tashua314",
      "2026-07-20",
    );

    expect(result).toMatchObject({ ok: false });
    expect(upsertPaymentScheduledDate).not.toHaveBeenCalled();
  });
});
