import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/lib/server/db/client";
import {
  auditLogs,
  authSessions,
  githubProjectStatusSyncs,
  monthlySettlementSnapshots,
  monthlyWorkSubmissions,
  workLogChangeRequests,
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
  await db.delete(monthlySettlementSnapshots);
  await db.delete(monthlyWorkSubmissions);
  await db.delete(workLogChangeRequests);
  await db.delete(workSessions);
  await db.delete(githubProjectStatusSyncs);
  await db.delete(authSessions);
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
});
