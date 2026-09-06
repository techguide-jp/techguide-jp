import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, postgresClient } from "$lib/server/db/client";
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

const first = () => completionReport();
const latest = () =>
  completionReport({
    id: "20000000-0000-4000-8000-000000000002",
    assigneeLogin: "replacement",
    createdBy: "replacement",
    settlementMonth: "2026-09",
    reportedAt: new Date("2026-09-01T00:00:00Z"),
    createdAt: new Date("2026-09-01T00:00:00Z"),
  });
const writeInput = (report = first()): CompletionReportWriteInput => ({
  ...report,
  evidenceUrl: report.evidenceUrl ?? undefined,
  evidenceNote: report.evidenceNote ?? undefined,
});
const confirm = (report = first()) =>
  confirmCompletionEligibility({
    report,
    confirmedAt: new Date("2026-09-10T00:00:00Z"),
  });
const approveEmptyMonths = async () => {
  await db.insert(monthlySettlementSnapshots).values(
    [first(), latest()].map((report) => ({
      month: report.settlementMonth,
      assigneeLogin: report.assigneeLogin,
      snapshot: { lines: [] },
      approvedBy: "admin",
    })),
  );
};

export const registerCompletionOwnershipDbTests = (): void => {
  it("担当者・月をまたぐ再報告は旧報告を失効し監査を残す", async () => {
    await replaceActiveCompletionReport(writeInput());
    await replaceActiveCompletionReport(writeInput(latest()));
    const reports = await db.select().from(issueCompletionReports);
    expect(
      reports.filter((row) => !row.invalidatedAt).map((row) => row.id),
    ).toEqual([latest().id]);
    expect(reports.find((row) => row.id === first().id)).toMatchObject({
      invalidatedBy: "replacement",
    });
    expect(
      (await db.select().from(auditLogs)).filter(
        (row) => row.action === "issue_completion_invalidated",
      ),
    ).toHaveLength(1);
  });

  it.each([false, true])(
    "既存の別担当者の重複報告を並行確認しても固定報酬は最新1件だけ: 追加=%s",
    async (supplemental) => {
      await db.insert(issueCompletionReports).values([first(), latest()]);
      if (supplemental) await approveEmptyMonths();
      const snapshots = await db.select().from(monthlySettlementSnapshots);
      const results = await Promise.all([
        confirm(first()),
        confirm(latest()),
        confirm(latest()),
        confirm(first()),
      ]);
      expect(
        results.filter(
          (result) => result === (supplemental ? "supplemental" : "base"),
        ),
      ).toHaveLength(1);
      expect(results.filter((result) => result === "unchanged")).toHaveLength(
        3,
      );
      const reports = await db.select().from(issueCompletionReports);
      expect(
        reports
          .filter((row) => row.eligibilityConfirmedAt)
          .map((row) => row.id),
      ).toEqual([latest().id]);
      expect(
        reports.find((row) => row.id === first().id)?.invalidatedAt,
      ).not.toBeNull();
      const payments = await db.select().from(supplementalPayments);
      expect(payments).toHaveLength(supplemental ? 1 : 0);
      if (supplemental)
        expect(payments[0]).toMatchObject({
          completionReportId: latest().id,
          assigneeLogin: "replacement",
          month: "2026-09",
          taxExcludedYen: 50_000,
          taxIncludedYen: 55_000,
        });
      expect(await db.select().from(monthlySettlementSnapshots)).toEqual(
        snapshots,
      );
      const audit = await db.select().from(auditLogs);
      expect(
        audit.filter((row) => row.action === "issue_completion_eligible"),
      ).toHaveLength(1);
      expect(
        audit.filter((row) => row.action === "issue_completion_invalidated"),
      ).toHaveLength(1);
      expect(
        audit.filter((row) => row.action === "supplemental_payment_created"),
      ).toHaveLength(supplemental ? 1 : 0);
    },
  );

  it("確認済み報告は担当変更後の再報告・移行登録で上書きしない", async () => {
    await db.insert(issueCompletionReports).values(first());
    expect(await confirm()).toBe("base");
    const saved = await db.select().from(issueCompletionReports);
    const audit = await db.select().from(auditLogs);
    for (const source of ["worker", "admin_backfill"] as const) {
      await expect(
        replaceActiveCompletionReport({ ...writeInput(latest()), source }),
      ).rejects.toThrow("確認済み・精算済み");
    }
    expect(await db.select().from(issueCompletionReports)).toEqual(saved);
    expect(await db.select().from(auditLogs)).toEqual(audit);
  });

  it("別担当者の新しい未確定報告より、先に確認した旧担当者の報告を維持する", async () => {
    await db.insert(issueCompletionReports).values(first());
    await confirm();
    await db.insert(issueCompletionReports).values(latest());
    expect(await confirm(latest())).toBe("unchanged");
    expect(await confirm(first())).toBe("unchanged");
    const reports = await db.select().from(issueCompletionReports);
    expect(
      reports.filter((row) => row.eligibilityConfirmedAt).map((row) => row.id),
    ).toEqual([first().id]);
    expect(
      reports.find((row) => row.id === latest().id)?.invalidatedAt,
    ).not.toBeNull();
  });

  it("古い時刻の移行・再報告では最新報告を差し替えない", async () => {
    await db.insert(issueCompletionReports).values(latest());
    for (const source of ["worker", "admin_backfill"] as const) {
      await expect(
        replaceActiveCompletionReport({ ...writeInput(), source }),
      ).rejects.toThrow("新しい完了報告");
    }
    expect(
      (await db.select().from(issueCompletionReports)).map((row) => row.id),
    ).toEqual([latest().id]);
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });

  it("異なる担当者の並行提出でも最新の有効報告は1件に収束する", async () => {
    const results = await Promise.allSettled([
      replaceActiveCompletionReport(writeInput(latest())),
      replaceActiveCompletionReport(writeInput(first())),
    ]);
    expect(results[0].status).toBe("fulfilled");
    const reports = await db.select().from(issueCompletionReports);
    expect(
      reports.filter((row) => !row.invalidatedAt).map((row) => row.id),
    ).toEqual([latest().id]);
  });

  it("確認済みの重複は自動取消せず追加支払いも増やさない", async () => {
    const reports = [first(), latest()].map((report) => ({
      ...report,
      eligibilityConfirmedAt: new Date("2026-09-10T00:00:00Z"),
    }));
    await db.insert(issueCompletionReports).values(reports);
    await approveEmptyMonths();
    expect(await Promise.all(reports.map(confirm))).toEqual([
      "unchanged",
      "unchanged",
    ]);
    expect(await db.select().from(supplementalPayments)).toHaveLength(0);
    expect(await db.select().from(auditLogs)).toHaveLength(0);
    expect(await db.select().from(issueCompletionReports)).toEqual(reports);
  });

  it.each([false, true])(
    "既存支払い済みの固定報酬を別報告で再計上せず、保存記録を変えない: 追加=%s",
    async (supplemental) => {
      const original = first();
      await db.insert(issueCompletionReports).values(original);
      if (supplemental) {
        await db.insert(supplementalPayments).values({
          completionReportId: original.id,
          month: original.settlementMonth,
          assigneeLogin: original.assigneeLogin,
          taxExcludedYen: 50000,
          taxYen: 5000,
          taxIncludedYen: 55000,
          status: "paid",
          scheduledDate: "2026-09-14",
          paidOn: "2026-09-14",
        });
      } else {
        await db.insert(monthlySettlementSnapshots).values({
          month: "2026-08",
          assigneeLogin: "worker",
          approvedBy: "admin",
          snapshot: {
            lines: [
              {
                issue: {
                  repository: original.repository,
                  number: original.issueNumber,
                },
                fixedRewardYen: 50000,
                completionReportId: original.id,
              },
            ],
          },
        });
        await db.insert(monthlyPayments).values({
          month: "2026-08",
          assigneeLogin: "worker",
          status: "paid",
          paidOn: "2026-09-14",
        });
      }
      const before = await Promise.all([
        db.select().from(monthlyPayments),
        db.select().from(monthlySettlementSnapshots),
        db.select().from(supplementalPayments),
      ]);
      await expect(
        replaceActiveCompletionReport(writeInput(latest())),
      ).rejects.toThrow("精算済み");
      await db.insert(issueCompletionReports).values(latest());
      expect(await confirm(latest())).toBe("unchanged");
      expect(
        await Promise.all([
          db.select().from(monthlyPayments),
          db.select().from(monthlySettlementSnapshots),
          db.select().from(supplementalPayments),
        ]),
      ).toEqual(before);
      expect(await db.select().from(auditLogs)).toHaveLength(0);
    },
  );

  it("確認のロック待機中に新報告がcommitされても旧報告を対象化しない", async () => {
    if (!postgresClient) throw new Error("local postgres required");
    await db.insert(issueCompletionReports).values(first());
    let release = () => {};
    let signal = () => {};
    const held = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const change = postgresClient.begin(async (transaction) => {
      const report = latest();
      await transaction`INSERT INTO issue_completion_reports (id, project_item_id, repository, issue_number, issue_title, issue_url, assignee_login, settlement_month, reported_at, reward_mode, fixed_reward_yen, created_by, created_at)
        VALUES (${report.id}, ${report.projectItemId}, ${report.repository}, ${report.issueNumber}, ${report.issueTitle}, ${report.issueUrl}, ${report.assigneeLogin}, ${report.settlementMonth}, ${report.reportedAt.toISOString()}, ${report.rewardMode}, ${report.fixedRewardYen}, ${report.createdBy}, ${report.createdAt.toISOString()})`;
      signal();
      await released;
    });
    await held;
    const confirmation = confirm(first());
    try {
      await expect
        .poll(
          async () => {
            const rows =
              await postgresClient!`SELECT 1 FROM pg_locks WHERE relation = 'issue_completion_reports'::regclass AND mode = 'ShareRowExclusiveLock' AND NOT granted`;
            return rows.length;
          },
          { timeout: 3000 },
        )
        .toBeGreaterThan(0);
    } finally {
      release();
    }
    await change;
    expect(await confirmation).toBe("unchanged");
    expect(await confirm(latest())).toBe("base");
    const [old] = await db
      .select()
      .from(issueCompletionReports)
      .where(eq(issueCompletionReports.id, first().id));
    expect(old.eligibilityConfirmedAt).toBeNull();
  });
};
