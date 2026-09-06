import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db, postgresClient } from "$lib/server/db/client";
import {
  auditLogs,
  emailDeliveries,
  emailNotificationEvents,
  issueHourlyRates,
  monthlyFeedback,
  monthlySettlementSnapshots,
  monthlyWorkSubmissions,
  workerProfiles,
} from "$lib/server/db/schema";
import { saveWorkerPreferences } from "$lib/server/workers/workerPreferencesRepository";
import { upsertWorkerSelfProfile } from "$lib/server/workers/workerProfileRepository";
import {
  getMonthlyFeedback,
  updateMonthlyFeedback,
} from "$lib/server/settlements/monthlyFeedbackRepository";
import type { WorkSubmissionOptions } from "$lib/server/settlements/submissionWriteRepository";
import { upsertWorkSubmission } from "$lib/server/settlements/submissionRepository";
import { restoreSettlementSummary } from "$lib/server/settlements/settlementSnapshotRestore";
import { readSettlementSourceToken } from "$lib/server/settlements/settlementWriteGuard";
import { settlementSnapshotV1 } from "./fixtures/settlementSnapshotV1";
const feedback = {
  operatorComment: "運営へ質問",
  privateReflection: "本人限定の振り返り",
  version: 0,
};
const preferences = {
  availabilityNote: "週5時間",
  selfAssignmentNote: "Svelte",
  partnerInterest: "conditional" as const,
  partnerConditions: "在宅",
  version: 0,
};
const submission = async (
  settlementRuleVersion: 1 | 2 = 2,
): Promise<WorkSubmissionOptions> => ({
  submittedAt: new Date(),
  feedback,
  ...(settlementRuleVersion === 2
    ? {
        settlementRuleVersion: 2 as const,
        expectedSourceToken: await readSettlementSourceToken(),
      }
    : { settlementRuleVersion: 1 as const }),
});
const saveSubmission = (options: WorkSubmissionOptions) =>
  upsertWorkSubmission(
    restoreSettlementSummary(settlementSnapshotV1)!,
    "worker",
    options,
  );

export const registerMonthlyFeedbackDbTests = (): void => {
  it.each([1, 2] as const)(
    "V%s: 申請・コメントは同時保存し、競合で両方を維持する",
    async (settlementRuleVersion) => {
      const eventId = randomUUID();
      const notification = {
        eventId,
        eventKey: `feedback-test:${eventId}`,
        type: "settlement_submitted" as const,
        month: "2026-08",
        assigneeLogin: "worker",
        occurredAt: new Date(),
        payloadJson: "{}",
        deliveries: [],
      };
      const input = {
        ...(await submission(settlementRuleVersion)),
        notification,
      };
      expect(await saveSubmission(input)).toBe(true);
      expect(
        await getMonthlyFeedback("2026-08", "worker", false),
      ).not.toHaveProperty("privateReflection");
      expect(await getMonthlyFeedback("2026-08", "worker", true)).toMatchObject(
        { ...feedback, version: 1 },
      );
      const before = await db.select().from(monthlyWorkSubmissions);
      expect(await db.select().from(issueHourlyRates)).toHaveLength(
        settlementRuleVersion === 2 ? 1 : 0,
      );
      const audit = await db.select().from(auditLogs);
      expect(
        audit.filter((row) => row.action === "monthly_work_submitted"),
      ).toHaveLength(settlementRuleVersion === 2 ? 1 : 0);
      expect(
        await saveSubmission({
          ...(await submission(settlementRuleVersion)),
          submittedAt: new Date(Date.now() + 1000),
          feedback: { ...feedback, operatorComment: "古い画面" },
          notification: {
            ...notification,
            eventId: randomUUID(),
            eventKey: "loser",
          },
        }),
      ).toBe(false);
      expect(await db.select().from(monthlyWorkSubmissions)).toEqual(before);
      const events = await db.select().from(emailNotificationEvents);
      expect(events).toHaveLength(1);
      const outward = JSON.stringify([
        before,
        events,
        await db.select().from(emailDeliveries),
        await db.select().from(auditLogs),
      ]);
      expect(outward).not.toContain(feedback.privateReflection);
      expect(outward).not.toContain(feedback.operatorComment);
    },
  );
  it("V2のトークンが空ならV1へ切り替えず、申請・コメント・単価を保存しない", async () => {
    expect(
      await saveSubmission({
        ...(await submission()),
        settlementRuleVersion: 2,
        expectedSourceToken: "",
      }),
    ).toBe(false);
    expect(await db.select().from(monthlyWorkSubmissions)).toHaveLength(0);
    expect(await db.select().from(monthlyFeedback)).toHaveLength(0);
    expect(await db.select().from(issueHourlyRates)).toHaveLength(0);
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });
  it("コメント保存の制約違反は申請もrollbackする", async () => {
    await expect(
      saveSubmission({
        ...(await submission()),
        feedback: { ...feedback, privateReflection: "あ".repeat(2001) },
      }),
    ).rejects.toThrow();
    expect(await db.select().from(monthlyWorkSubmissions)).toHaveLength(0);
    expect(await db.select().from(monthlyFeedback)).toHaveLength(0);
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });
  it("申請後の本文だけの編集は金額・申請日時・計算入力の版を変えない", async () => {
    await saveSubmission(await submission());
    const before = await db.select().from(monthlyWorkSubmissions);
    const sourceToken = await readSettlementSourceToken();
    expect(
      await updateMonthlyFeedback("2026-08", "worker", {
        ...feedback,
        operatorComment: "追記",
        version: 1,
      }),
    ).toBe(true);
    expect(await db.select().from(monthlyWorkSubmissions)).toEqual(before);
    expect(await readSettlementSourceToken()).toBe(sourceToken);
    expect(
      await updateMonthlyFeedback("2026-08", "worker", {
        ...feedback,
        version: 1,
      }),
    ).toBe(false);
  });
  it("未申請・承認済みの月次コメントを変更できない", async () => {
    expect(await updateMonthlyFeedback("2026-08", "worker", feedback)).toBe(
      false,
    );
    await saveSubmission(await submission());
    await db.insert(monthlySettlementSnapshots).values({
      month: "2026-08",
      assigneeLogin: "worker",
      approvedBy: "admin",
      snapshot: settlementSnapshotV1,
    });
    expect(
      await updateMonthlyFeedback("2026-08", "worker", {
        ...feedback,
        version: 1,
      }),
    ).toBe(false);
    expect(
      await saveSubmission({
        ...(await submission()),
        feedback: { ...feedback, version: 1 },
      }),
    ).toBe(false);
  });
  it("承認transactionを待ったコメント更新は承認完了後に拒否される", async () => {
    if (!postgresClient) throw new Error("ローカルDBテスト専用");
    await saveSubmission(await submission());
    let locked!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const approval = postgresClient.begin(async (sql) => {
      await sql`LOCK TABLE monthly_settlement_snapshots IN SHARE ROW EXCLUSIVE MODE`;
      locked();
      await gate;
      await sql`INSERT INTO monthly_settlement_snapshots (month, assignee_login, approved_by, snapshot) VALUES ('2026-08', 'worker', 'admin', ${JSON.stringify(settlementSnapshotV1)}::jsonb)`;
    });
    await ready;
    const saving = updateMonthlyFeedback("2026-08", "worker", {
      ...feedback,
      version: 1,
    });
    release();
    await approval;
    expect(await saving).toBe(false);
  });
  it("精算なしの希望保存・同時更新・基本情報保存で最新の希望を保持する", async () => {
    await db.insert(workerProfiles).values({
      login: "worker",
      displayName: "既存",
      availabilityNote: "古い目安",
      selfAssignmentNote: "既存希望",
    });
    const outcomes = await Promise.all([
      saveWorkerPreferences("worker", preferences),
      saveWorkerPreferences("worker", {
        ...preferences,
        availabilityNote: "週10時間",
      }),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const [before] = await db.select().from(workerProfiles);
    await upsertWorkerSelfProfile({
      login: "worker",
      displayName: "新しい表示名",
      slackMemberId: "",
      skills: [],
      specialtyNote: "",
    });
    const [after] = await db.select().from(workerProfiles);
    expect(after.availabilityNote).toBe(before.availabilityNote);
    expect(after.preferencesVersion).toBe(1);
    expect(after.partnerInterest).toBe("conditional");
    expect(await db.select().from(monthlyWorkSubmissions)).toHaveLength(0);
    expect(await db.select().from(emailNotificationEvents)).toHaveLength(0);
  });
};
