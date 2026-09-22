import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "$lib/server/db/client";
import { auditLogs, workLogChangeRequests } from "$lib/server/db/schema";
import { cancelWorkLogChange } from "$lib/server/work/changeRequestCancellation";
import { reviewChangeRequestAndInvalidateCompletion } from "$lib/server/work/workRepository";

const create = async (
  status: "pending" | "approved" | "rejected" = "pending",
) => {
  const id = randomUUID();
  await db.insert(workLogChangeRequests).values({
    id,
    requestType: "add",
    status,
    assigneeLogin: "worker",
    requestedBy: "worker",
    repository: "example/repo",
    issueNumber: 22,
    issueTitle: "申請の取り消し",
    requestedStartedAt: new Date("2026-08-21T13:00:00Z"),
    requestedEndedAt: new Date("2026-08-22T07:00:00Z"),
    reason: "入力間違い",
  });
  return id;
};

export const registerChangeRequestCancellationDbTests = () => {
  it("本人だけが未処理の申請を取り消せて、履歴と監査を一度だけ残す", async () => {
    const id = await create();
    expect((await cancelWorkLogChange(id, "other")).ok).toBe(false);
    expect((await cancelWorkLogChange(id, "worker")).ok).toBe(true);
    expect((await cancelWorkLogChange(id, "worker")).ok).toBe(false);
    const [row] = await db
      .select()
      .from(workLogChangeRequests)
      .where(eq(workLogChangeRequests.id, id));
    expect(row.status).toBe("cancelled");
    expect(row.reason).toBe("入力間違い");
    expect(row.reviewedBy).toBe("worker");
    const audit = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, id));
    expect(audit.map((row) => row.action)).toEqual([
      "work_log_change_cancelled",
    ]);
    expect(
      await reviewChangeRequestAndInvalidateCompletion(
        id,
        "approved",
        "admin",
        null,
      ),
    ).toBeNull();
  });
  it.each(["approved", "rejected"] as const)(
    "%s済みの申請は取り消せない",
    async (status) => {
      const id = await create(status);
      expect((await cancelWorkLogChange(id, "worker")).ok).toBe(false);
    },
  );
  it("本人の取り消しと管理者の承認が競合しても一方だけ成立する", async () => {
    const id = await create();
    const [cancel, review] = await Promise.all([
      cancelWorkLogChange(id, "worker"),
      reviewChangeRequestAndInvalidateCompletion(id, "approved", "admin", null),
    ]);
    expect(Number(cancel.ok) + Number(review !== null)).toBe(1);
    const audit = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, id));
    expect(audit).toHaveLength(1);
  });
};
