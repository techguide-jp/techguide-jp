import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { db } from "$lib/server/db/client";
import {
  issueCompletionReports,
  monthlySettlementSnapshots,
  supplementalPayments,
} from "$lib/server/db/schema";
import { listBackfillableIssueRefs } from "$lib/server/completions/completionBackfillRepository";
import { completionReport } from "./fixtures/completionReport";

export const registerCompletionBackfillDbTests = (): void => {
  it("移行候補は過去月・別担当者の承認済み固定報酬、追加支払い、有効な完了報告を除外する", async () => {
    const repository = "techguide-jp/example";
    const refs = [10, 11, 12, 13, 14, 15].map((number) => ({
      repository,
      number,
    }));
    const supplementalReport = completionReport({
      id: randomUUID(),
      issueNumber: 14,
      invalidatedAt: new Date(),
      invalidatedBy: "admin",
      invalidationReason: "旧報告",
    });
    await db.insert(issueCompletionReports).values([
      completionReport(),
      completionReport({
        id: randomUUID(),
        issueNumber: 11,
        invalidatedAt: new Date(),
        invalidatedBy: "admin",
        invalidationReason: "取り下げ",
      }),
      supplementalReport,
    ]);
    const line = (number: number, fixedRewardYen = 50000) => ({
      issue: { repository, number },
      fixedRewardYen,
      timedRewardYen: 1000,
    });
    await db.insert(monthlySettlementSnapshots).values([
      {
        month: "2026-07",
        assigneeLogin: "previous-worker",
        approvedBy: "admin",
        snapshot: { lines: [line(12), line(15, 0)] },
      },
      {
        month: "2026-08",
        assigneeLogin: "other-worker",
        approvedBy: "admin",
        snapshot: { comparable: { lines: [line(13)] } },
      },
    ]);
    await db.insert(supplementalPayments).values({
      completionReportId: supplementalReport.id,
      month: "2026-08",
      assigneeLogin: "worker",
      taxExcludedYen: 50000,
      taxYen: 5000,
      taxIncludedYen: 55000,
    });
    const candidates = await listBackfillableIssueRefs([
      ...refs,
      { repository: "techguide-jp/another", number: 12 },
    ]);
    expect(new Set(candidates)).toEqual(
      new Set([
        { repository, number: 11 },
        { repository, number: 15 },
        { repository: "techguide-jp/another", number: 12 },
      ]),
    );
    expect(await listBackfillableIssueRefs([])).toEqual([]);
  });
};
