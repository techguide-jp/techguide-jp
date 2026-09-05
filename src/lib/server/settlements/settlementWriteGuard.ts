import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type postgres from "postgres";
import { neonClient, postgresClient } from "$lib/server/db/client";

const dialect = new PgDialect();

// 全期間上限・単価・完了報告へ影響する表を含める。監査・メール・通知書は計算入力ではない。
const sourceTables = [
  "work_sessions",
  "work_log_change_requests",
  "issue_completion_reports",
  "monthly_work_submissions",
  "monthly_settlement_snapshots",
  "monthly_payments",
  "supplemental_payments",
  "issue_hourly_rates",
] as const;

const sourceVersion = (): SQL =>
  sql`md5(jsonb_build_array(${sql.join(
    sourceTables.map(
      (table) => sql`(
    SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text), '[]'::jsonb)
    FROM ${sql.identifier(table)} AS row
  )`,
    ),
    sql`, `,
  )})::text)`;

export const settlementSourceMatches = (expectedToken?: string): SQL =>
  expectedToken === undefined
    ? sql`true`
    : sql`${sourceVersion()} = ${expectedToken}`;

/** Drizzleが生成したSQLと束縛パラメータを、両ドライバへ同じ順序で渡す。 */
export const executeSettlementQueries = async (
  queries: SQL[],
): Promise<unknown[]> => {
  const compiled = queries.map((query) => dialect.sqlToQuery(query));
  if (postgresClient) {
    return postgresClient.begin(
      "isolation level read committed",
      async (transaction) => {
        const results: unknown[] = [];
        for (const query of compiled) {
          results.push(
            await transaction.unsafe(
              query.sql,
              query.params as postgres.ParameterOrJSON<never>[],
            ),
          );
        }
        return results;
      },
    );
  }
  if (neonClient) {
    const client = neonClient;
    return client.transaction(
      compiled.map((query) => client.query(query.sql, query.params)),
      { isolationLevel: "ReadCommitted" },
    );
  }
  throw new Error("Database client is not configured.");
};

export const readSettlementSourceToken = async (): Promise<string> => {
  const [result] = await executeSettlementQueries([
    sql`SELECT ${sourceVersion()} AS token`,
  ]);
  const token = Array.isArray(result)
    ? (result[0] as { token?: unknown })?.token
    : null;
  if (typeof token !== "string")
    throw new Error("精算元データの版を取得できません。");
  return token;
};

export const executeGuardedSettlementWrite = async (
  query: SQL,
): Promise<unknown> => {
  // INSERTも検知するため行ロックではなく表ロックを使う。外部API処理は必ずこの外で済ませる。
  // LOCK完了後の別statementで再検証することで、待機中にcommitされた変更も検知する。
  try {
    const results = await executeSettlementQueries([
      sql`SET LOCAL lock_timeout = '5s'`,
      sql`SET LOCAL statement_timeout = '10s'`,
      sql`LOCK TABLE ${sql.join(
        sourceTables.map((table) => sql.identifier(table)),
        sql`, `,
      )} IN SHARE ROW EXCLUSIVE MODE`,
      query,
    ]);
    return results[results.length - 1];
  } catch (error) {
    // 競合時はtransaction全体がrollbackされる。成功通知を出さず再実行を求める。
    const code =
      error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "55P03" || code === "40P01" || code === "40001") return [];
    throw error;
  }
};
