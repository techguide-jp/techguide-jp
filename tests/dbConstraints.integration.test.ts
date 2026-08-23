import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, postgresClient } from "../src/lib/server/db/client";
import { listNoticeAssigneeLoginsForMonth } from "../src/lib/server/notices/noticeRepository";
import {
  auditLogs,
  authSessions,
  emailDeliveries,
  emailNotificationEvents,
  githubProjectStatusSyncs,
  monthlyPayments,
  monthlySettlementSnapshots,
  monthlyWorkSubmissions,
  paymentNotices,
  workLogChangeRequests,
  workerPayoutAccounts,
  workerProfiles,
  workSessions,
} from "../src/lib/server/db/schema";
import { upsertPaymentPaid } from "../src/lib/server/payments/paymentRepository";
import { recordSettlementApproval } from "../src/lib/server/settlements/settlementApprovalRepository";
import { createSettlementSnapshotPayload } from "../src/lib/server/settlements/settlementSnapshot";
import type { SettlementSummary } from "../src/lib/server/settlements/settlementTypes";
import type { PreparedNotificationWrite } from "../src/lib/server/notifications/notificationWrite";
import {
  claimEmailDelivery,
  getEmailDelivery,
  listOperationalEmailDeliveries,
  markDeliveryResult,
} from "../src/lib/server/notifications/deliveryRepository";

const describeDb =
  process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if (
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    typeof error.cause.code === "string"
  ) {
    return error.cause.code;
  }
  return undefined;
};

const createNotification = (input: {
  type: "settlement_paid" | "settlement_approved";
  eventKey: string;
  month?: string;
  assigneeLogin?: string;
  occurredAt: Date;
}): PreparedNotificationWrite => {
  const eventId = randomUUID();
  const deliveryId = randomUUID();
  return {
    eventId,
    eventKey: input.eventKey,
    type: input.type,
    month: input.month ?? "2026-06",
    assigneeLogin: input.assigneeLogin ?? "worker",
    occurredAt: input.occurredAt,
    payloadJson: "{}",
    deliveries: [
      {
        id: deliveryId,
        recipientLogin: "worker",
        recipientEmail: "worker@example.com",
        status: "pending",
        subject: "subject",
        textBody: "text",
        htmlBody: "<p>html</p>",
        idempotencyKey: `production/settlement-notification/${deliveryId}`,
        errorCode: null,
      },
    ],
  };
};

beforeEach(async () => {
  if (process.env.RUN_DB_INTEGRATION !== "1") return;
  await db.delete(emailDeliveries);
  await db.delete(emailNotificationEvents);
  await db.delete(auditLogs);
  await db.delete(paymentNotices);
  await db.delete(monthlyPayments);
  await db.delete(monthlySettlementSnapshots);
  await db.delete(monthlyWorkSubmissions);
  await db.delete(workLogChangeRequests);
  await db.delete(workSessions);
  await db.delete(githubProjectStatusSyncs);
  await db.delete(authSessions);
  await db.delete(workerPayoutAccounts);
  await db.delete(workerProfiles);
});

describeDb("DB constraints", () => {
  it("支払い更新と1イベント・複数配送を同一transactionで保存する", async () => {
    const occurredAt = new Date("2026-07-14T00:00:00Z");
    const eventId = randomUUID();
    const notification: PreparedNotificationWrite = {
      eventId,
      eventKey: "settlement_paid:2026-06:worker:operation-1",
      type: "settlement_paid",
      month: "2026-06",
      assigneeLogin: "worker",
      occurredAt,
      payloadJson: JSON.stringify({ paidOn: "2026-07-14" }),
      deliveries: ["admin-a", "admin-b"].map((recipientLogin) => {
        const id = randomUUID();
        return {
          id,
          recipientLogin,
          recipientEmail: `${recipientLogin}@example.com`,
          status: "pending" as const,
          subject: "subject",
          textBody: "text",
          htmlBody: "<p>html</p>",
          idempotencyKey: `production/settlement-notification/${id}`,
          errorCode: null,
        };
      }),
    };

    await upsertPaymentPaid(
      { month: "2026-06", assigneeLogin: "worker", paidOn: "2026-07-14" },
      { updatedAt: occurredAt, expectedUpdatedAt: null, notification },
    );

    expect(await db.select().from(emailNotificationEvents)).toHaveLength(1);
    expect(await db.select().from(emailDeliveries)).toHaveLength(2);

    const deliveryId = notification.deliveries[0].id;
    const claims = await Promise.all([
      claimEmailDelivery(deliveryId, "pending"),
      claimEmailDelivery(deliveryId, "pending"),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(getEmailDelivery(deliveryId)).resolves.toMatchObject({
      status: "sending",
      attemptCount: 1,
    });

    await markDeliveryResult({
      id: deliveryId,
      status: "failed",
      errorCode: "temporary_failure",
    });
    expect(await claimEmailDelivery(deliveryId, "failed")).not.toBeNull();
    await markDeliveryResult({
      id: deliveryId,
      status: "accepted",
      resendEmailId: "resend-1",
    });
    await expect(getEmailDelivery(deliveryId)).resolves.toMatchObject({
      status: "accepted",
      resendEmailId: "resend-1",
      errorCode: null,
    });
  });

  it("同じ未処理版への競合支払いは1件だけ確定・通知する", async () => {
    await postgresClient!`
      INSERT INTO monthly_payments (
        month, assignee_login, status, updated_at
      ) VALUES (
        '2026-06', 'worker', 'unpaid',
        '2026-07-13T00:00:00.123456Z'::timestamptz
      )
    `;
    const [currentPayment] = await db.select().from(monthlyPayments);
    const expectedUpdatedAt = currentPayment.updatedAt;

    const candidates = [
      {
        paidOn: "2026-07-14",
        updatedAt: new Date("2026-07-14T00:00:00Z"),
      },
      {
        paidOn: "2026-07-15",
        updatedAt: new Date("2026-07-15T00:00:00Z"),
      },
    ];
    const results = await Promise.all(
      candidates.map((candidate, index) =>
        upsertPaymentPaid(
          {
            month: "2026-06",
            assigneeLogin: "worker",
            paidOn: candidate.paidOn,
          },
          {
            expectedUpdatedAt,
            updatedAt: candidate.updatedAt,
            notification: createNotification({
              type: "settlement_paid",
              eventKey: `settlement_paid:2026-06:worker:race-${index}`,
              occurredAt: candidate.updatedAt,
            }),
          },
        ),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(emailNotificationEvents)).toHaveLength(1);
    expect(await db.select().from(emailDeliveries)).toHaveLength(1);
    const winnerIndex = results.findIndex(Boolean);
    const [payment] = await db.select().from(monthlyPayments);
    expect(payment.paidOn).toBe(candidates[winnerIndex].paidOn);
  });

  it("同じ承認版への競合承認は1件だけ確定・通知する", async () => {
    const summary: SettlementSummary = {
      month: "2026-06",
      assigneeLogin: "worker",
      fixedRewardYen: 1000,
      timedRewardYen: 0,
      taxExcludedYen: 1000,
      taxYen: 100,
      taxIncludedYen: 1100,
      lines: [],
      pendingRequests: [],
      unsettledProjectIssues: [],
      unsettledIssueSessions: [],
      approvalRequired: true,
      blockingReasons: [],
    };
    await postgresClient!`
      INSERT INTO monthly_settlement_snapshots (
        month, assignee_login, snapshot, approved_by, approved_at
      ) VALUES (
        ${summary.month}, ${summary.assigneeLogin},
        ${JSON.stringify(createSettlementSnapshotPayload(summary))}::jsonb,
        'initial-admin',
        '2026-06-30T00:00:00.123456Z'::timestamptz
      )
    `;
    const [currentSnapshot] = await db
      .select()
      .from(monthlySettlementSnapshots);
    const expectedApprovedAt = currentSnapshot.approvedAt.toISOString();
    const candidates = [
      {
        scheduledDate: "2026-07-14",
        approvedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        scheduledDate: "2026-07-15",
        approvedAt: "2026-07-02T00:00:00.000Z",
      },
    ];
    const results = await Promise.all(
      candidates.map((candidate, index) =>
        recordSettlementApproval({
          summary,
          approvedBy: `admin-${index}`,
          approvedAt: candidate.approvedAt,
          expectedApprovedAt,
          scheduledDate: candidate.scheduledDate,
          notification: createNotification({
            type: "settlement_approved",
            eventKey: `settlement_approved:2026-06:worker:race-${index}`,
            occurredAt: new Date(candidate.approvedAt),
          }),
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(emailNotificationEvents)).toHaveLength(1);
    expect(await db.select().from(emailDeliveries)).toHaveLength(1);
    expect(await db.select().from(auditLogs)).toHaveLength(1);
    const winnerIndex = results.findIndex(Boolean);
    const [payment] = await db.select().from(monthlyPayments);
    expect(payment.scheduledDate).toBe(candidates[winnerIndex].scheduledDate);
  });

  it("直近100件より古い未解決配送も操作一覧に残す", async () => {
    const eventId = randomUUID();
    await db.insert(emailNotificationEvents).values({
      id: eventId,
      eventKey: `settlement_paid:2026-06:worker:${randomUUID()}`,
      type: "settlement_paid",
      month: "2026-06",
      assigneeLogin: "worker",
      occurredAt: new Date("2026-07-14T00:00:00Z"),
      payload: { paidOn: "2026-07-14" },
    });

    const pendingId = randomUUID();
    await db.insert(emailDeliveries).values([
      {
        id: pendingId,
        eventId,
        recipientLogin: "pending-worker",
        recipientEmail: "pending@example.com",
        status: "pending",
        subject: "subject",
        textBody: "text",
        htmlBody: "<p>html</p>",
        idempotencyKey: `production/settlement-notification/${pendingId}`,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      ...Array.from({ length: 101 }, (_, index) => {
        const id = randomUUID();
        return {
          id,
          eventId,
          recipientLogin: `accepted-${index}`,
          recipientEmail: `accepted-${index}@example.com`,
          status: "accepted" as const,
          subject: "subject",
          textBody: "text",
          htmlBody: "<p>html</p>",
          idempotencyKey: `production/settlement-notification/${id}`,
          createdAt: new Date(Date.UTC(2026, 6, 1, 0, 0, index)),
        };
      }),
    ]);

    const deliveries = await listOperationalEmailDeliveries();
    expect(deliveries.some((delivery) => delivery.id === pendingId)).toBe(true);
    expect(
      deliveries.filter((delivery) => delivery.status === "accepted"),
    ).toHaveLength(100);
  });

  it("同じassigneeとIssueの未終了ログを二重作成できない", async () => {
    const base = {
      assigneeLogin: "tashua314",
      repository: "techguide-jp/akademy_fes",
      issueNumber: 501,
      issueTitle: "E2E",
      startedAt: new Date("2026-06-18T00:00:00Z"),
      createdBy: "tashua314",
    };

    await db.insert(workSessions).values(base);

    try {
      await db.insert(workSessions).values({
        ...base,
        startedAt: new Date("2026-06-18T01:00:00Z"),
      });
      throw new Error("unique constraint did not fail");
    } catch (error) {
      expect(errorCode(error)).toBe("23505");
    }
  });

  it("追加申請は開始と終了の両方が必要", async () => {
    try {
      await db.insert(workLogChangeRequests).values({
        requestType: "add",
        assigneeLogin: "tashua314",
        repository: "techguide-jp/akademy_fes",
        issueNumber: 501,
        issueTitle: "E2E",
        reason: "押し忘れ",
        requestedBy: "tashua314",
      });
      throw new Error("shape constraint did not fail");
    } catch (error) {
      expect(errorCode(error)).toBe("23514");
    }
  });

  it("支払い済みは支払日が必須", async () => {
    try {
      await db.insert(monthlyPayments).values({
        month: "2026-06",
        assigneeLogin: "tashua314",
        status: "paid",
      });
      throw new Error("paid check constraint did not fail");
    } catch (error) {
      expect(errorCode(error)).toBe("23514");
    }
  });

  it("未処理は支払日を持てない", async () => {
    try {
      await db.insert(monthlyPayments).values({
        month: "2026-06",
        assigneeLogin: "tashua314",
        status: "unpaid",
        paidOn: "2026-07-14",
      });
      throw new Error("unpaid check constraint did not fail");
    } catch (error) {
      expect(errorCode(error)).toBe("23514");
    }
  });

  it("不正な月フォーマットの支払いは保存できない", async () => {
    try {
      await db.insert(monthlyPayments).values({
        month: "2026-13",
        assigneeLogin: "tashua314",
      });
      throw new Error("month check constraint did not fail");
    } catch (error) {
      expect(errorCode(error)).toBe("23514");
    }
  });

  it("不正な月フォーマットの支払い通知書は保存できない", async () => {
    try {
      await db.insert(paymentNotices).values({
        month: "2026-13",
        assigneeLogin: "tashua314",
        document: {
          schemaVersion: 1,
          totals: {
            fixedRewardYen: 0,
            timedRewardYen: 0,
            taxExcludedYen: 0,
            taxYen: 0,
            taxIncludedYen: 0,
          },
          lines: [],
          workLogs: [],
        },
        workerDisplayName: "tashua314",
        recipientEncryptedPayload: '{"v":1,"data":"AAAA"}',
        payerEncryptedPayload: '{"v":1,"data":"AAAA"}',
        scheduledDate: "2026-07-14",
        approvedBy: "admin",
        approvedAt: new Date("2026-07-11T00:00:00Z"),
        issuedOn: "2026-07-11",
        createdBy: "admin",
      });
      throw new Error("month check constraint did not fail");
    } catch (error) {
      expect(errorCode(error)).toBe("23514");
    }
  });

  it("現在の承認日時と一致する支払い通知書だけを一覧対象にする", async () => {
    const currentApprovedAt = new Date("2026-07-12T00:00:00Z");
    const staleApprovedAt = new Date("2026-07-11T00:00:00Z");
    await db.insert(monthlySettlementSnapshots).values([
      {
        month: "2026-06",
        assigneeLogin: "current-user",
        snapshot: {},
        approvedBy: "admin",
        approvedAt: currentApprovedAt,
      },
      {
        month: "2026-06",
        assigneeLogin: "stale-user",
        snapshot: {},
        approvedBy: "admin",
        approvedAt: currentApprovedAt,
      },
    ]);

    const noticeBase = {
      month: "2026-06",
      document: {
        schemaVersion: 1 as const,
        totals: {
          fixedRewardYen: 0,
          timedRewardYen: 0,
          taxExcludedYen: 0,
          taxYen: 0,
          taxIncludedYen: 0,
        },
        lines: [],
        workLogs: [],
      },
      recipientEncryptedPayload: '{"v":1,"data":"AAAA"}',
      payerEncryptedPayload: '{"v":1,"data":"AAAA"}',
      scheduledDate: "2026-07-14",
      approvedBy: "admin",
      issuedOn: "2026-07-12",
      createdBy: "admin",
    };
    await db.insert(paymentNotices).values([
      {
        ...noticeBase,
        assigneeLogin: "current-user",
        workerDisplayName: "Current User",
        approvedAt: currentApprovedAt,
      },
      {
        ...noticeBase,
        assigneeLogin: "stale-user",
        workerDisplayName: "Stale User",
        approvedAt: staleApprovedAt,
      },
    ]);

    await expect(listNoticeAssigneeLoginsForMonth("2026-06")).resolves.toEqual([
      "current-user",
    ]);
  });

  it("worker_profiles削除時に振込先も削除される", async () => {
    await db.insert(workerProfiles).values({
      login: "payout-user",
      displayName: "Payout User",
    });
    await db.insert(workerPayoutAccounts).values({
      login: "payout-user",
      encryptedPayload: '{"v":1,"data":"AAAA"}',
      updatedBy: "payout-user",
    });

    await db
      .delete(workerProfiles)
      .where(eq(workerProfiles.login, "payout-user"));

    const rows = await db
      .select()
      .from(workerPayoutAccounts)
      .where(eq(workerPayoutAccounts.login, "payout-user"));
    expect(rows).toHaveLength(0);
  });
});
