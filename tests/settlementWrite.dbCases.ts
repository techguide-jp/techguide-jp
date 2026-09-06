import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, postgresClient } from "$lib/server/db/client";
import {
  auditLogs,
  emailNotificationEvents,
  issueHourlyRates,
  monthlyWorkSubmissions,
  monthlySettlementSnapshots,
  workSessions,
  workLogChangeRequests,
  issueCompletionReports,
  monthlyPayments,
} from "$lib/server/db/schema";
import { buildSettlementSummariesV2 } from "$lib/server/settlements/settlementCalculatorV2";
import { createSettlementSnapshotPayload } from "$lib/server/settlements/settlementSnapshot";
import { recordWorkSubmission } from "$lib/server/settlements/submissionWriteRepository";
import { recordSettlementApproval } from "$lib/server/settlements/settlementApprovalRepository";
import { listFrozenHourlyRates } from "$lib/server/settlements/hourlyRateRepository";
import { readSettlementSourceToken } from "$lib/server/settlements/settlementWriteGuard";
import type { ProjectIssue } from "$lib/server/github/projectTypes";

const issue: ProjectIssue = {
  projectItemId: "item",
  repository: "example/repo",
  number: 1,
  title: "guard",
  url: "https://github.com/example/repo/issues/1",
  state: "OPEN",
  status: "In Progress",
  assignees: ["worker"],
  createdAt: "2026-08-01T00:00:00Z",
  closedAt: null,
  rewardMode: "ハイブリッド",
  fixedRewardYen: 50000,
  hourlyRateYen: 6000,
  extraCapYen: null,
};

const fixture = async () => {
  const [session] = await db
    .insert(workSessions)
    .values({
      repository: issue.repository,
      issueNumber: issue.number,
      issueTitle: issue.title,
      assigneeLogin: "worker",
      createdBy: "worker",
      startedAt: new Date("2026-08-20T00:00:00Z"),
      endedAt: new Date("2026-08-20T01:00:00Z"),
    })
    .returning();
  const summary = buildSettlementSummariesV2(
    "2026-08",
    [issue],
    [session],
    [],
    { completionReports: [], supplementalPayments: [] },
  )[0];
  return { session, summary };
};

const submitInput = (
  summary: Awaited<ReturnType<typeof fixture>>["summary"],
  expectedSourceToken: string,
) => ({
  summary,
  submittedBy: "worker",
  submittedAt: new Date("2026-09-01T00:00:00Z"),
  settlementRuleVersion: 2 as const,
  expectedSourceToken,
});

export const registerSettlementWriteDbTests = (): void => {
  it("初回単価は明細除外・別月再申請でも消えず、一度だけ監査される", async () => {
    const { summary } = await fixture();
    expect(
      await recordWorkSubmission(
        submitInput(summary, await readSettlementSourceToken()),
      ),
    ).toBe(true);
    const initial = await db.select().from(issueHourlyRates);
    expect(initial[0]).toMatchObject({
      hourlyRateYen: 6000,
      firstMonth: "2026-08",
      source: "submission",
    });
    const empty = {
      ...summary,
      lines: [],
      fixedRewardYen: 0,
      timedRewardYen: 0,
      taxExcludedYen: 0,
      taxYen: 0,
      taxIncludedYen: 0,
    };
    expect(
      await recordWorkSubmission(
        submitInput(empty, await readSettlementSourceToken()),
      ),
    ).toBe(true);
    expect(await listFrozenHourlyRates()).toEqual(
      new Map([["example/repo#1#worker", 6000]]),
    );
    const later = {
      ...summary,
      month: "2026-09",
      lines: summary.lines.map((line) => ({
        ...line,
        hourlyRateYenSnapshot: 9000,
      })),
    };
    expect(
      await recordWorkSubmission(
        submitInput(later, await readSettlementSourceToken()),
      ),
    ).toBe(true);
    expect(await db.select().from(issueHourlyRates)).toEqual(initial);
    const audit = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "issue_hourly_rate_frozen"));
    expect(audit).toHaveLength(1);
  });

  it("旧申請を明細なしで差し替えても、その直前の保存単価を移行する", async () => {
    const { summary } = await fixture();
    await db.insert(monthlyWorkSubmissions).values({
      month: summary.month,
      assigneeLogin: "worker",
      snapshot: createSettlementSnapshotPayload(summary),
      submittedBy: "worker",
      submittedAt: new Date("2026-09-01T00:00:00Z"),
    });
    const empty = {
      ...summary,
      lines: [],
      fixedRewardYen: 0,
      timedRewardYen: 0,
      taxExcludedYen: 0,
      taxYen: 0,
      taxIncludedYen: 0,
    };
    expect(
      await recordWorkSubmission(
        submitInput(empty, await readSettlementSourceToken()),
      ),
    ).toBe(true);
    expect((await db.select().from(issueHourlyRates))[0]).toMatchObject({
      hourlyRateYen: 6000,
      source: "legacy_snapshot",
    });
  });

  it("既存の承認・支払い済み記録を変更せず旧単価を移行する", async () => {
    const { summary } = await fixture();
    const old = {
      month: "2026-08",
      assigneeLogin: "worker",
      snapshot: createSettlementSnapshotPayload(summary),
      approvedBy: "admin",
      approvedAt: new Date("2026-09-03T00:00:00Z"),
    };
    await db.insert(monthlySettlementSnapshots).values(old);
    const snapshotsBefore = await db.select().from(monthlySettlementSnapshots);
    await db.insert(monthlyPayments).values({
      month: "2026-08",
      assigneeLogin: "worker",
      status: "paid",
      paidOn: "2026-09-10",
    });
    const before = await db.select().from(monthlyPayments);
    expect(
      await recordWorkSubmission(
        submitInput(
          { ...summary, month: "2026-09" },
          await readSettlementSourceToken(),
        ),
      ),
    ).toBe(true);
    expect(await db.select().from(monthlySettlementSnapshots)).toEqual(
      snapshotsBefore,
    );
    expect(await db.select().from(monthlyPayments)).toEqual(before);
    expect((await db.select().from(issueHourlyRates))[0].hourlyRateYen).toBe(
      6000,
    );
  });

  it("同じDB版から同時申請しても1件だけ成功し、単価と通知を二重に保存しない", async () => {
    const { summary } = await fixture();
    const token = await readSettlementSourceToken();
    const notification = {
      eventId: randomUUID(),
      eventKey: "concurrent-submission",
      type: "settlement_submitted" as const,
      month: summary.month,
      assigneeLogin: "worker",
      occurredAt: new Date(),
      payloadJson: "{}",
      deliveries: [],
    };
    const results = await Promise.all([
      recordWorkSubmission({ ...submitInput(summary, token), notification }),
      recordWorkSubmission({ ...submitInput(summary, token), notification }),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(await db.select().from(issueHourlyRates)).toHaveLength(1);
    expect(await db.select().from(emailNotificationEvents)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "monthly_work_submitted")),
    ).toHaveLength(1);
  });

  it.each(["log", "request", "report", "submission", "other-month"])(
    "読み取り後に%sが変わった場合は承認・監査・通知を保存しない",
    async (kind) => {
      const { session, summary } = await fixture();
      const token = await readSettlementSourceToken();
      if (kind === "log")
        await db
          .update(workSessions)
          .set({ excludedAt: new Date() })
          .where(eq(workSessions.id, session.id));
      if (kind === "request")
        await db.insert(workLogChangeRequests).values({
          repository: issue.repository,
          issueNumber: 1,
          issueTitle: issue.title,
          assigneeLogin: "worker",
          requestType: "exclude",
          targetSessionId: session.id,
          reason: "重複",
          requestedBy: "worker",
        });
      if (kind === "report")
        await db.insert(issueCompletionReports).values({
          projectItemId: "item",
          repository: issue.repository,
          issueNumber: 1,
          issueTitle: issue.title,
          issueUrl: issue.url,
          assigneeLogin: "worker",
          settlementMonth: "2026-08",
          reportedAt: new Date("2026-08-31T00:00:00Z"),
          rewardMode: "固定",
          fixedRewardYen: 50000,
          createdBy: "worker",
        });
      if (kind === "submission")
        await db.insert(monthlyWorkSubmissions).values({
          month: "2026-08",
          assigneeLogin: "worker",
          submittedBy: "worker",
          snapshot: {},
        });
      if (kind === "other-month")
        await db.insert(workSessions).values({
          repository: issue.repository,
          issueNumber: 1,
          issueTitle: issue.title,
          assigneeLogin: "other",
          createdBy: "other",
          startedAt: new Date("2026-09-01T00:00:00Z"),
          endedAt: new Date("2026-09-01T01:00:00Z"),
        });
      expect(
        await recordSettlementApproval({
          summary,
          approvedBy: "admin",
          expectedApprovedAt: null,
          expectedSourceToken: token,
        }),
      ).toBe(false);
      expect(await db.select().from(monthlySettlementSnapshots)).toHaveLength(
        0,
      );
      expect(await db.select().from(auditLogs)).toHaveLength(0);
      expect(await db.select().from(emailNotificationEvents)).toHaveLength(0);
    },
  );

  it("未commitの修正がロック待機中にcommitされても、修正前の金額を承認しない", async () => {
    if (!postgresClient) throw new Error("local postgres required");
    const { summary, session } = await fixture();
    const token = await readSettlementSourceToken();
    let release: () => void = () => {};
    let signal: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const change = postgresClient.begin(async (transaction) => {
      await transaction`UPDATE work_sessions SET excluded_at = now() WHERE id = ${session.id}`;
      signal();
      await released;
    });
    await held;
    const approval = recordSettlementApproval({
      summary,
      approvedBy: "admin",
      expectedApprovedAt: null,
      expectedSourceToken: token,
    });
    try {
      // 実際にLOCK待機へ入ったことをDBから確認してから、修正をcommitする。
      await expect
        .poll(
          async () => {
            const rows =
              await postgresClient!`SELECT 1 FROM pg_locks WHERE relation = 'work_sessions'::regclass AND mode = 'ShareRowExclusiveLock' AND NOT granted`;
            return rows.length;
          },
          { timeout: 3000 },
        )
        .toBeGreaterThan(0);
    } finally {
      release();
    }
    await change;
    expect(await approval).toBe(false);
    expect(await db.select().from(monthlySettlementSnapshots)).toHaveLength(0);
  });

  it("変更がなければ承認でき、同時承認は1回だけ確定する", async () => {
    const { summary } = await fixture();
    const token = await readSettlementSourceToken();
    const input = {
      summary,
      approvedBy: "admin",
      expectedApprovedAt: null,
      expectedSourceToken: token,
    };
    expect(
      (
        await Promise.all([
          recordSettlementApproval(input),
          recordSettlementApproval(input),
        ])
      ).sort(),
    ).toEqual([false, true]);
    expect(await db.select().from(monthlySettlementSnapshots)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "monthly_settlement_approved")),
    ).toHaveLength(1);
  });
};
