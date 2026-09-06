import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "$lib/server/db/client";
import {
  auditLogs,
  issueCompletionReports,
  monthlyPayments,
  monthlySettlementSnapshots,
  supplementalPayments,
} from "$lib/server/db/schema";
import {
  confirmCompletionEligibility,
  replaceActiveCompletionReport,
} from "$lib/server/completions/completionRepository";
import type { CompletionReportWriteInput } from "$lib/server/completions/completionTypes";
import { completionReport } from "./fixtures/completionReport";

const input = (): CompletionReportWriteInput => ({
  ...completionReport(),
  id: randomUUID(),
  reportedAt: new Date(),
  settlementMonth: "2026-07",
  source: "admin_confirmation",
  evidenceUrl: "https://github.com/techguide-jp/example/issues/10",
  evidenceNote: "管理者による完了確認",
  createdBy: "admin",
});

export const registerCompletionMonthDbTests = (): void => {
  it("管理者の指定月を操作日時と分けて保存し、記録と監査を重複させない", async () => {
    const results = await Promise.allSettled([
      replaceActiveCompletionReport(input()),
      replaceActiveCompletionReport(input()),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const [report] = await db.select().from(issueCompletionReports);
    expect(report).toMatchObject({
      settlementMonth: "2026-07",
      source: "admin_confirmation",
      createdBy: "admin",
    });
    expect(report.reportedAt.getTime()).toBeGreaterThan(
      new Date("2026-08-01").getTime(),
    );
    expect(report.eligibilityConfirmedAt).not.toBeNull();
    expect(
      (await db.select().from(auditLogs)).map((row) => row.action),
    ).toEqual(["issue_settlement_month_assigned"]);
    await expect(
      replaceActiveCompletionReport({
        ...input(),
        source: "worker",
        settlementMonth: "2026-09",
      }),
    ).rejects.toThrow("確認済み・精算済み");
  });

  it.each([false, true])(
    "既存報告の月・担当者・金額は管理者指定で変更しない: 確認済み=%s",
    async (confirmed) => {
      const old = completionReport({
        eligibilityConfirmedAt: confirmed ? new Date() : null,
      });
      await db.insert(issueCompletionReports).values(old);
      await expect(
        replaceActiveCompletionReport({ ...input(), assigneeLogin: "other" }),
      ).rejects.toThrow("確認済み・精算済み");
      expect(await db.select().from(issueCompletionReports)).toEqual([old]);
      expect(await db.select().from(auditLogs)).toHaveLength(0);
    },
  );

  it("指定月が支払い済みなら保存直前にも拒否する", async () => {
    const write = input();
    await db.insert(monthlyPayments).values({
      month: write.settlementMonth,
      assigneeLogin: write.assigneeLogin,
      status: "paid",
      paidOn: "2026-08-20",
    });
    await expect(replaceActiveCompletionReport(write)).rejects.toThrow(
      "確認済み・精算済み",
    );
    expect(await db.select().from(issueCompletionReports)).toHaveLength(0);
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });

  it("承認済み指定月は追加支払いを作り、元の承認内容は変更しない", async () => {
    const write = input();
    await db.insert(monthlySettlementSnapshots).values({
      month: write.settlementMonth,
      assigneeLogin: write.assigneeLogin,
      snapshot: { lines: [] },
      approvedBy: "admin",
    });
    const before = await db.select().from(monthlySettlementSnapshots);
    const report = await replaceActiveCompletionReport(write);
    expect(
      await confirmCompletionEligibility({ report, confirmedAt: new Date() }),
    ).toBe("supplemental");
    expect(
      await confirmCompletionEligibility({ report, confirmedAt: new Date() }),
    ).toBe("unchanged");
    expect(await db.select().from(supplementalPayments)).toMatchObject([
      {
        month: write.settlementMonth,
        completionReportId: report.id,
        taxExcludedYen: write.fixedRewardYen,
      },
    ]);
    expect(await db.select().from(monthlySettlementSnapshots)).toEqual(before);
  });
};
