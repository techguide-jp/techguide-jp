import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { db } from "$lib/server/db/client";
import {
  monthlyWorkSubmissions,
  workLogChangeRequests,
  workSessions,
} from "$lib/server/db/schema";
import {
  createUnlockedSessionChangeRequest,
  listWorkSessionLocks,
} from "$lib/server/work/workSessionLockRepository";
import { cancelWorkLogChange } from "$lib/server/work/changeRequestCancellation";

const prepare = async () => {
  const id = randomUUID();
  await db.insert(workSessions).values({
    id,
    repository: "owner/repo",
    issueNumber: 22,
    issueTitle: "ログ",
    assigneeLogin: "worker",
    createdBy: "worker",
    startedAt: new Date("2026-08-21T00:00:00Z"),
    endedAt: new Date("2026-08-21T01:00:00Z"),
  });
  return {
    targetSessionId: id,
    requestType: "edit" as const,
    repository: "owner/repo",
    issueNumber: 22,
    issueTitle: "ログ",
    assigneeLogin: "worker",
    requestedStartedAt: new Date("2026-08-21T00:00:00Z"),
    requestedEndedAt: new Date("2026-08-21T02:00:00Z"),
    reason: "修正",
  };
};

export const registerWorkSessionLockDbTests = (): void => {
  it("同時に修正と除外を申請しても1件だけ受け付け、取り消したら再申請できる", async () => {
    const input = await prepare();
    const results = await Promise.all([
      createUnlockedSessionChangeRequest(input),
      createUnlockedSessionChangeRequest({
        ...input,
        requestType: "exclude",
        requestedStartedAt: undefined,
        requestedEndedAt: undefined,
      }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await listWorkSessionLocks("worker")).toEqual({
      [input.targetSessionId]: "pending",
    });
    expect(await listWorkSessionLocks("other")).toEqual({});
    const [request] = await db.select().from(workLogChangeRequests);
    expect((await cancelWorkLogChange(request.id, "worker")).ok).toBe(true);
    expect(await listWorkSessionLocks("worker")).toEqual({});
    expect(await createUnlockedSessionChangeRequest(input)).toBe(true);
  });

  it.each(["legacy", "versioned"])(
    "%s形式の別月精算に含まれるログも修正・除外できない",
    async (format) => {
      const input = await prepare();
      const content = {
        lines: [{ sessions: [{ id: input.targetSessionId }] }],
      };
      await db.insert(monthlyWorkSubmissions).values({
        month: "2026-09",
        assigneeLogin: "worker",
        submittedBy: "worker",
        snapshot:
          format === "legacy"
            ? content
            : { schemaVersion: 4, comparable: content },
      });
      expect(await listWorkSessionLocks("worker")).toEqual({
        [input.targetSessionId]: "submitted",
      });
      expect(await createUnlockedSessionChangeRequest(input)).toBe(false);
      expect(
        await createUnlockedSessionChangeRequest({
          ...input,
          requestType: "exclude",
          requestedStartedAt: undefined,
          requestedEndedAt: undefined,
        }),
      ).toBe(false);
      expect(await db.select().from(workLogChangeRequests)).toHaveLength(0);
    },
  );
};
