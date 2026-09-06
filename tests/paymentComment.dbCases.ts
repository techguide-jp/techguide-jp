import { expect, it } from "vitest";
import { db } from "../src/lib/server/db/client";
import { monthlyPayments } from "../src/lib/server/db/schema";
import {
  getPaymentRow,
  upsertPaymentPaid,
  upsertPaymentScheduledDate,
  upsertPaymentUnpaid,
} from "../src/lib/server/payments/paymentRepository";

export const registerPaymentCommentDbTests = (): void => {
  it("支払いコメントを保存・取消・再登録し、予定日変更では保持する", async () => {
    const key = { month: "2026-06", assigneeLogin: "worker" };
    const first = await upsertPaymentPaid(
      {
        ...key,
        paidOn: "2026-07-14",
        paymentComment: "振込名義: テックガイド\n調整済み",
      },
      { expectedUpdatedAt: null },
    );
    expect(first?.paymentComment).toBe("振込名義: テックガイド\n調整済み");
    const scheduled = await upsertPaymentScheduledDate({
      ...key,
      scheduledDate: "2026-07-20",
    });
    expect(scheduled).toMatchObject({
      paymentComment: first?.paymentComment,
      paidOn: "2026-07-14",
    });

    const reverted = await upsertPaymentUnpaid(key);
    expect(reverted).toMatchObject({
      status: "unpaid",
      paidOn: null,
      paymentComment: null,
      scheduledDate: "2026-07-20",
    });
    const second = await upsertPaymentPaid(
      { ...key, paidOn: "2026-07-21", paymentComment: "新しいコメント" },
      { expectedUpdatedAt: reverted.updatedAt },
    );
    expect(second).toMatchObject({
      paymentComment: "新しいコメント",
      scheduledDate: "2026-07-20",
    });

    const unpaid = await upsertPaymentUnpaid(key);
    await upsertPaymentPaid(
      { ...key, paidOn: "2026-07-22", paymentComment: null },
      { expectedUpdatedAt: unpaid.updatedAt },
    );
    expect(await getPaymentRow(key.month, key.assigneeLogin)).toMatchObject({
      status: "paid",
      paidOn: "2026-07-22",
      paymentComment: null,
    });
  });

  it("コメント列を指定しない既存形式の支払いも読み取れる", async () => {
    await db.insert(monthlyPayments).values({
      month: "2026-06",
      assigneeLogin: "legacy-worker",
      status: "paid",
      paidOn: "2026-07-14",
    });
    expect(await getPaymentRow("2026-06", "legacy-worker")).toMatchObject({
      paymentComment: null,
    });
  });
};
