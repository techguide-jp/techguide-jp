import { and, eq, gte, isNull, lt, or, type SQL } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import {
  workLogChangeRequests,
  workSessions,
  type WorkLogChangeRequest,
  type WorkSession
} from "$lib/server/db/schema";

type IssueRef = {
  repository: string;
  issueNumber: number;
};

type UtcRange = {
  start: Date;
  end: Date;
};

const issueRefFilter = (issueRefs: IssueRef[]): SQL | undefined => {
  if (issueRefs.length === 0) return undefined;
  return or(
    ...issueRefs.map((issue) =>
      and(
        eq(workSessions.repository, issue.repository),
        eq(workSessions.issueNumber, issue.issueNumber)
      )
    )
  );
};

const requestIssueRefFilter = (issueRefs: IssueRef[]): SQL | undefined => {
  if (issueRefs.length === 0) return undefined;
  return or(
    ...issueRefs.map((issue) =>
      and(
        eq(workLogChangeRequests.repository, issue.repository),
        eq(workLogChangeRequests.issueNumber, issue.issueNumber)
      )
    )
  );
};

export const listWorkSessions = async (): Promise<WorkSession[]> => {
  return db.select().from(workSessions);
};

export const listWorkSessionsForSettlementContext = async (
  range: UtcRange,
  issueRefs: IssueRef[]
): Promise<WorkSession[]> => {
  const issueFilter = issueRefFilter(issueRefs);
  return db
    .select()
    .from(workSessions)
    .where(
      or(
        ...(issueFilter ? [issueFilter] : []),
        and(gte(workSessions.startedAt, range.start), lt(workSessions.startedAt, range.end)),
        and(gte(workSessions.endedAt, range.start), lt(workSessions.endedAt, range.end)),
        and(isNull(workSessions.endedAt), isNull(workSessions.excludedAt))
      )
    );
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

export const listChangeRequestsForSettlementContext = async (
  range: UtcRange,
  issueRefs: IssueRef[]
): Promise<WorkLogChangeRequest[]> => {
  const issueFilter = requestIssueRefFilter(issueRefs);
  return db
    .select()
    .from(workLogChangeRequests)
    .where(
      or(
        ...(issueFilter ? [issueFilter] : []),
        and(gte(workLogChangeRequests.createdAt, range.start), lt(workLogChangeRequests.createdAt, range.end)),
        and(
          gte(workLogChangeRequests.requestedStartedAt, range.start),
          lt(workLogChangeRequests.requestedStartedAt, range.end)
        )
      )
    );
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
    .where(and(eq(workLogChangeRequests.id, requestId), eq(workLogChangeRequests.status, "pending")))
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
