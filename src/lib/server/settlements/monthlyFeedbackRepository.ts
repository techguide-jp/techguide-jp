import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { monthlyFeedback } from "$lib/server/db/schema";
import { executeSettlementQueries } from "$lib/server/settlements/settlementWriteGuard";
import type {
  MonthlyFeedbackInput,
  MonthlyFeedbackView,
} from "$lib/monthlyFeedback";

export const getMonthlyFeedback = async (
  month: string,
  login: string,
  includePrivate: boolean,
): Promise<MonthlyFeedbackView | null> => {
  // 本人以外のSELECTには私的な振り返り列そのものを含めない。
  const [row] = await db
    .select({
      operatorComment: monthlyFeedback.operatorComment,
      ...(includePrivate
        ? { privateReflection: monthlyFeedback.privateReflection }
        : {}),
      version: monthlyFeedback.version,
      updatedAt: monthlyFeedback.updatedAt,
    })
    .from(monthlyFeedback)
    .where(
      and(
        eq(monthlyFeedback.month, month),
        eq(monthlyFeedback.assigneeLogin, login),
      ),
    )
    .limit(1);
  return row ?? null;
};

export const feedbackWriteAllowed = (
  month: string,
  login: string,
  version: number,
): SQL => sql`
  NOT EXISTS (SELECT 1 FROM monthly_settlement_snapshots WHERE month = ${month} AND assignee_login = ${login})
  AND coalesce((SELECT version FROM monthly_feedback WHERE month = ${month} AND assignee_login = ${login}), 0) = ${version}
`;

export const feedbackInsert = (
  month: string,
  login: string,
  input: MonthlyFeedbackInput,
  condition: SQL,
): SQL => sql`
  INSERT INTO monthly_feedback (month, assignee_login, operator_comment, private_reflection, version, updated_at)
  SELECT ${month}, ${login}, ${input.operatorComment}, ${input.privateReflection}, 1, now()
  WHERE ${condition}
  ON CONFLICT (month, assignee_login) DO UPDATE SET operator_comment = EXCLUDED.operator_comment,
    private_reflection = EXCLUDED.private_reflection, version = monthly_feedback.version + 1, updated_at = now()
  RETURNING version
`;

export const executeFeedbackWrite = async (query: SQL): Promise<unknown> => {
  const results = await executeSettlementQueries([
    sql`SET LOCAL lock_timeout = '5s'`,
    // 承認の保存と順序を揃え、承認後にコメント更新が滑り込むのを防ぐ。
    sql`LOCK TABLE monthly_work_submissions, monthly_settlement_snapshots, monthly_feedback IN SHARE ROW EXCLUSIVE MODE`,
    query,
  ]);
  return results[results.length - 1];
};

export const updateMonthlyFeedback = async (
  month: string,
  login: string,
  input: MonthlyFeedbackInput,
): Promise<boolean> => {
  const result = await executeFeedbackWrite(
    feedbackInsert(
      month,
      login,
      input,
      sql`
    ${feedbackWriteAllowed(month, login, input.version)}
    AND EXISTS (SELECT 1 FROM monthly_work_submissions WHERE month = ${month} AND assignee_login = ${login})
  `,
    ),
  );
  return Array.isArray(result) && result.length > 0;
};
