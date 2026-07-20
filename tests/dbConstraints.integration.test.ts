import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/server/db/client";
import { listNoticeAssigneeLoginsForMonth } from "../src/lib/server/notices/noticeRepository";
import {
  auditLogs,
  authSessions,
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

beforeEach(async () => {
  if (process.env.RUN_DB_INTEGRATION !== "1") return;
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
