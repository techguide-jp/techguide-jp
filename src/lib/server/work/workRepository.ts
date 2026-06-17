import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import {
  workLogChangeRequests,
  workSessions,
  type WorkLogChangeRequest,
  type WorkSession
} from "$lib/server/db/schema";

export const listWorkSessions = async (): Promise<WorkSession[]> => {
  return db.select().from(workSessions);
};

export const listWorkSessionsForAssignee = async (assigneeLogin: string): Promise<WorkSession[]> => {
  return db.select().from(workSessions).where(eq(workSessions.assigneeLogin, assigneeLogin));
};

export const listOpenWorkSessionsForAssignee = async (assigneeLogin: string): Promise<WorkSession[]> => {
  return db
    .select()
    .from(workSessions)
    .where(
      and(
        eq(workSessions.assigneeLogin, assigneeLogin),
        isNull(workSessions.endedAt),
        isNull(workSessions.excludedAt)
      )
    );
};

export const findOpenWorkSession = async (
  assigneeLogin: string,
  repository: string,
  issueNumber: number
): Promise<WorkSession | null> => {
  const [session] = await db
    .select()
    .from(workSessions)
    .where(
      and(
        eq(workSessions.assigneeLogin, assigneeLogin),
        eq(workSessions.repository, repository),
        eq(workSessions.issueNumber, issueNumber),
        isNull(workSessions.endedAt),
        isNull(workSessions.excludedAt)
      )
    )
    .limit(1);
  return session ?? null;
};

export const getWorkSessionById = async (sessionId: string): Promise<WorkSession | null> => {
  const [session] = await db.select().from(workSessions).where(eq(workSessions.id, sessionId)).limit(1);
  return session ?? null;
};

export const createWorkSession = async (input: {
  assigneeLogin: string;
  repository: string;
  issueNumber: number;
  issueTitle: string;
  createdBy: string;
  startedAt?: Date;
}): Promise<WorkSession> => {
  const [session] = await db
    .insert(workSessions)
    .values({
      assigneeLogin: input.assigneeLogin,
      repository: input.repository,
      issueNumber: input.issueNumber,
      issueTitle: input.issueTitle,
      createdBy: input.createdBy,
      startedAt: input.startedAt ?? new Date()
    })
    .returning();
  return session;
};

export const endWorkSession = async (sessionId: string, userLogin: string): Promise<WorkSession | null> => {
  const [session] = await db
    .update(workSessions)
    .set({ endedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workSessions.id, sessionId),
        eq(workSessions.assigneeLogin, userLogin),
        isNull(workSessions.endedAt),
        isNull(workSessions.excludedAt)
      )
    )
    .returning();
  return session ?? null;
};

export const listChangeRequests = async (): Promise<WorkLogChangeRequest[]> => {
  return db.select().from(workLogChangeRequests);
};

export const listPendingChangeRequests = async (): Promise<WorkLogChangeRequest[]> => {
  return db
    .select()
    .from(workLogChangeRequests)
    .where(eq(workLogChangeRequests.status, "pending"));
};

export const createChangeRequest = async (input: {
  requestType: "add" | "edit" | "exclude";
  assigneeLogin: string;
  repository: string;
  issueNumber: number;
  issueTitle: string;
  targetSessionId?: string;
  requestedStartedAt?: Date;
  requestedEndedAt?: Date;
  reason: string;
  requestedBy: string;
}): Promise<WorkLogChangeRequest> => {
  const [request] = await db
    .insert(workLogChangeRequests)
    .values({
      requestType: input.requestType,
      assigneeLogin: input.assigneeLogin,
      repository: input.repository,
      issueNumber: input.issueNumber,
      issueTitle: input.issueTitle,
      targetSessionId: input.targetSessionId,
      requestedStartedAt: input.requestedStartedAt,
      requestedEndedAt: input.requestedEndedAt,
      reason: input.reason,
      requestedBy: input.requestedBy
    })
    .returning();
  return request;
};

export const reviewChangeRequest = async (
  requestId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  note: string | null
): Promise<WorkLogChangeRequest | null> => {
  const [request] = await db
    .update(workLogChangeRequests)
    .set({ status, reviewedBy, reviewedAt: new Date(), reviewNote: note })
    .where(eq(workLogChangeRequests.id, requestId))
    .returning();
  return request ?? null;
};

export const visibleSessionsWhereIssueIn = (
  sessions: WorkSession[],
  issueKeys: Set<string>
): WorkSession[] => {
  return sessions.filter((session) => {
    const key = `${session.repository}#${session.issueNumber}`;
    return issueKeys.has(key) && !session.excludedAt;
  });
};
