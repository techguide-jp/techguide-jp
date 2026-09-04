import { randomUUID } from "node:crypto";
import { and, eq, gte, isNull, lt, or, type SQL } from "drizzle-orm";
import { db, neonClient, postgresClient } from "$lib/server/db/client";
import {
  workLogChangeRequests,
  workSessions,
  type WorkLogChangeRequest,
  type WorkSession,
} from "$lib/server/db/schema";
import type { SqlTag } from "$lib/server/notifications/notificationWrite";

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
        eq(workSessions.issueNumber, issue.issueNumber),
      ),
    ),
  );
};

const requestIssueRefFilter = (issueRefs: IssueRef[]): SQL | undefined => {
  if (issueRefs.length === 0) return undefined;
  return or(
    ...issueRefs.map((issue) =>
      and(
        eq(workLogChangeRequests.repository, issue.repository),
        eq(workLogChangeRequests.issueNumber, issue.issueNumber),
      ),
    ),
  );
};

export const listWorkSessions = async (): Promise<WorkSession[]> => {
  return db.select().from(workSessions);
};

export const createWorkSessionAndInvalidateCompletion = async (input: {
  assigneeLogin: string;
  repository: string;
  issueNumber: number;
  issueTitle: string;
  createdBy: string;
}): Promise<WorkSession> => {
  const id = randomUUID();
  const startedAt = new Date();
  const queries = <TResult>(sql: SqlTag<TResult>): TResult[] => [
    sql`
      INSERT INTO work_sessions (
        id, assignee_login, repository, issue_number, issue_title,
        started_at, created_by, created_at, updated_at
      ) VALUES (
        ${id}::uuid, ${input.assigneeLogin}, ${input.repository},
        ${input.issueNumber}, ${input.issueTitle},
        ${startedAt.toISOString()}::timestamptz, ${input.createdBy},
        ${startedAt.toISOString()}::timestamptz,
        ${startedAt.toISOString()}::timestamptz
      )
    `,
    sql`
      WITH invalidated AS (
        UPDATE issue_completion_reports
        SET
          invalidated_at = ${startedAt.toISOString()}::timestamptz,
          invalidated_by = ${input.createdBy},
          invalidation_reason = ${"完了報告後に新しい稼働が開始されました。"}
        WHERE repository = ${input.repository}
          AND issue_number = ${input.issueNumber}
          AND assignee_login = ${input.assigneeLogin}
          AND invalidated_at IS NULL
          AND eligibility_confirmed_at IS NULL
          AND reported_at < ${startedAt.toISOString()}::timestamptz
        RETURNING id
      )
      INSERT INTO audit_logs (
        actor_login, action, target_type, target_id, details
      )
      SELECT
        ${input.createdBy}, ${"issue_completion_invalidated"},
        ${"issue_completion_report"}, invalidated.id::text,
        ${JSON.stringify({ reason: "new_work_started" })}::jsonb
      FROM invalidated
    `,
  ];
  if (postgresClient) {
    await postgresClient.begin(async (sql) => {
      for (const query of queries(
        sql as unknown as SqlTag<ReturnType<typeof sql>>,
      )) {
        await query;
      }
    });
  } else if (neonClient) {
    await neonClient.transaction((sql) => queries(sql));
  } else {
    throw new Error("Database client is not configured.");
  }
  const [session] = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.id, id))
    .limit(1);
  if (!session) throw new Error("稼働開始の保存に失敗しました。");
  return session;
};

export const listWorkSessionsForSettlementContext = async (
  range: UtcRange,
  issueRefs: IssueRef[],
): Promise<WorkSession[]> => {
  const issueFilter = issueRefFilter(issueRefs);
  return db
    .select()
    .from(workSessions)
    .where(
      or(
        ...(issueFilter ? [issueFilter] : []),
        and(
          gte(workSessions.startedAt, range.start),
          lt(workSessions.startedAt, range.end),
        ),
        and(
          gte(workSessions.endedAt, range.start),
          lt(workSessions.endedAt, range.end),
        ),
        and(isNull(workSessions.endedAt), isNull(workSessions.excludedAt)),
        // 月全体をまたぐログも、JST月境界で按分するため取得対象に含める。
        and(
          lt(workSessions.startedAt, range.end),
          gte(workSessions.endedAt, range.start),
        ),
      ),
    );
};

export const listWorkSessionsForAssignee = async (
  assigneeLogin: string,
): Promise<WorkSession[]> => {
  return db
    .select()
    .from(workSessions)
    .where(eq(workSessions.assigneeLogin, assigneeLogin));
};

export const listOpenWorkSessionsForAssignee = async (
  assigneeLogin: string,
): Promise<WorkSession[]> => {
  return db
    .select()
    .from(workSessions)
    .where(
      and(
        eq(workSessions.assigneeLogin, assigneeLogin),
        isNull(workSessions.endedAt),
        isNull(workSessions.excludedAt),
      ),
    );
};

export const listOpenWorkSessions = async (): Promise<WorkSession[]> => {
  return db
    .select()
    .from(workSessions)
    .where(and(isNull(workSessions.endedAt), isNull(workSessions.excludedAt)));
};

export const findOpenWorkSession = async (
  assigneeLogin: string,
  repository: string,
  issueNumber: number,
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
        isNull(workSessions.excludedAt),
      ),
    )
    .limit(1);
  return session ?? null;
};

export const getWorkSessionById = async (
  sessionId: string,
): Promise<WorkSession | null> => {
  const [session] = await db
    .select()
    .from(workSessions)
    .where(eq(workSessions.id, sessionId))
    .limit(1);
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
      startedAt: input.startedAt ?? new Date(),
    })
    .returning();
  return session;
};

export const endWorkSession = async (
  sessionId: string,
  userLogin: string,
): Promise<WorkSession | null> => {
  const [session] = await db
    .update(workSessions)
    .set({ endedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workSessions.id, sessionId),
        eq(workSessions.assigneeLogin, userLogin),
        isNull(workSessions.endedAt),
        isNull(workSessions.excludedAt),
      ),
    )
    .returning();
  return session ?? null;
};

export const listChangeRequests = async (): Promise<WorkLogChangeRequest[]> => {
  return db.select().from(workLogChangeRequests);
};

export const listChangeRequestsForSettlementContext = async (
  range: UtcRange,
  issueRefs: IssueRef[],
): Promise<WorkLogChangeRequest[]> => {
  const issueFilter = requestIssueRefFilter(issueRefs);
  return db
    .select()
    .from(workLogChangeRequests)
    .where(
      or(
        ...(issueFilter ? [issueFilter] : []),
        and(
          gte(workLogChangeRequests.createdAt, range.start),
          lt(workLogChangeRequests.createdAt, range.end),
        ),
        and(
          gte(workLogChangeRequests.requestedStartedAt, range.start),
          lt(workLogChangeRequests.requestedStartedAt, range.end),
        ),
        and(
          gte(workLogChangeRequests.requestedEndedAt, range.start),
          lt(workLogChangeRequests.requestedEndedAt, range.end),
        ),
        and(
          lt(workLogChangeRequests.requestedStartedAt, range.end),
          gte(workLogChangeRequests.requestedEndedAt, range.start),
        ),
      ),
    );
};

export const listPendingChangeRequests = async (): Promise<
  WorkLogChangeRequest[]
> => {
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
      requestedBy: input.requestedBy,
    })
    .returning();
  return request;
};

export const reviewChangeRequest = async (
  requestId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  note: string | null,
): Promise<WorkLogChangeRequest | null> => {
  const [request] = await db
    .update(workLogChangeRequests)
    .set({ status, reviewedBy, reviewedAt: new Date(), reviewNote: note })
    .where(
      and(
        eq(workLogChangeRequests.id, requestId),
        eq(workLogChangeRequests.status, "pending"),
      ),
    )
    .returning();
  return request ?? null;
};

export const reviewChangeRequestAndInvalidateCompletion = async (
  requestId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  note: string | null,
): Promise<WorkLogChangeRequest | null> => {
  const reviewedAt = new Date();
  const queries = <TResult>(sql: SqlTag<TResult>): TResult[] => [
    sql`
      WITH reviewed AS (
        UPDATE work_log_change_requests
        SET
          status = ${status}::work_log_change_request_status,
          reviewed_by = ${reviewedBy},
          reviewed_at = ${reviewedAt.toISOString()}::timestamptz,
          review_note = ${note}
        WHERE id = ${requestId}::uuid
          AND status = 'pending'
        RETURNING *
      )
      INSERT INTO audit_logs (
        actor_login, action, target_type, target_id, details
      )
      SELECT
        ${reviewedBy}, ${"work_log_change_reviewed"},
        ${"work_log_change_request"}, reviewed.id::text,
        jsonb_build_object(
          'status', reviewed.status,
          'note', reviewed.review_note,
          'assigneeLogin', reviewed.assignee_login,
          'repository', reviewed.repository,
          'issueNumber', reviewed.issue_number
        )
      FROM reviewed
    `,
    sql`
      WITH invalidated AS (
        UPDATE issue_completion_reports AS report
        SET
          invalidated_at = ${reviewedAt.toISOString()}::timestamptz,
          invalidated_by = ${reviewedBy},
          invalidation_reason = ${"完了報告後の時間帯を含む稼働修正が承認されました。"}
        FROM work_log_change_requests AS request
        WHERE request.id = ${requestId}::uuid
          AND request.reviewed_at = ${reviewedAt.toISOString()}::timestamptz
          AND request.status = 'approved'
          AND request.requested_ended_at IS NOT NULL
          AND report.repository = request.repository
          AND report.issue_number = request.issue_number
          AND report.assignee_login = request.assignee_login
          AND report.invalidated_at IS NULL
          AND report.eligibility_confirmed_at IS NULL
          AND report.reported_at < request.requested_ended_at
        RETURNING report.id
      )
      INSERT INTO audit_logs (
        actor_login, action, target_type, target_id, details
      )
      SELECT
        ${reviewedBy}, ${"issue_completion_invalidated"},
        ${"issue_completion_report"}, invalidated.id::text,
        ${JSON.stringify({ reason: "approved_work_change" })}::jsonb
      FROM invalidated
    `,
  ];
  if (postgresClient) {
    await postgresClient.begin(async (sql) => {
      for (const query of queries(
        sql as unknown as SqlTag<ReturnType<typeof sql>>,
      )) {
        await query;
      }
    });
  } else if (neonClient) {
    await neonClient.transaction((sql) => queries(sql));
  } else {
    throw new Error("Database client is not configured.");
  }
  const [request] = await db
    .select()
    .from(workLogChangeRequests)
    .where(
      and(
        eq(workLogChangeRequests.id, requestId),
        eq(workLogChangeRequests.reviewedAt, reviewedAt),
      ),
    )
    .limit(1);
  return request ?? null;
};

export const visibleSessionsWhereIssueIn = (
  sessions: WorkSession[],
  issueKeys: Set<string>,
): WorkSession[] => {
  return sessions.filter((session) => {
    const key = `${session.repository}#${session.issueNumber}`;
    return issueKeys.has(key) && !session.excludedAt;
  });
};
