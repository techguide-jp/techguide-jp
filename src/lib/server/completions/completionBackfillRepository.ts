import { sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import {
  fixedSettlementLines,
  hasSupplementalForIssue,
} from "$lib/server/completions/completionOwnershipSql";

type IssueRef = { repository: string; number: number };

export const listBackfillableIssueRefs = async (
  issues: IssueRef[],
): Promise<IssueRef[]> => {
  if (issues.length === 0) return [];
  const issue = {
    repository: sql`candidate.repository`,
    issueNumber: sql`candidate.number`,
  };
  // 月・担当者をまたぐ精算も除外し、直接POST時の重複登録ガードと同じ範囲を扱う。
  return db
    .select({
      repository: sql<string>`candidate.repository`,
      number: sql<number>`candidate.number`,
    })
    .from(
      sql`jsonb_to_recordset(${JSON.stringify(
        issues.map(({ repository, number }) => ({ repository, number })),
      )}::jsonb) AS candidate(repository text, number integer)`,
    ).where(sql`
      NOT EXISTS (
        SELECT 1 FROM issue_completion_reports report
        WHERE report.repository = candidate.repository
          AND report.issue_number = candidate.number
          AND report.invalidated_at IS NULL
      )
      AND NOT EXISTS (${fixedSettlementLines(issue)})
      AND NOT ${hasSupplementalForIssue(issue)}
    `);
};
