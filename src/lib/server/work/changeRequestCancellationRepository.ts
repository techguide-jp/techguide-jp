import { neonClient, postgresClient } from "$lib/server/db/client";
import type { SqlTag } from "$lib/server/notifications/notificationWrite";

/** 本人確認とpending判定を更新条件に含め、採否処理との競合をDBで防ぐ。 */
export const cancelPendingChangeRequest = async (
  id: string,
  login: string,
): Promise<boolean> => {
  const query = <TResult>(sql: SqlTag<TResult>): TResult => sql`
    WITH cancelled AS (
      UPDATE work_log_change_requests
      SET status = 'cancelled', reviewed_by = ${login}, reviewed_at = now(), review_note = '本人による取り消し'
      WHERE id = ${id}::uuid AND status = 'pending'
        AND assignee_login = ${login} AND requested_by = ${login}
      RETURNING id
    )
    INSERT INTO audit_logs (actor_login, action, target_type, target_id, details)
    SELECT ${login}, 'work_log_change_cancelled', 'work_log_change_request', id::text,
      jsonb_build_object('status', 'cancelled') FROM cancelled
    RETURNING target_id
  `;
  if (postgresClient) {
    const rows = await query(
      postgresClient as unknown as SqlTag<ReturnType<typeof postgresClient>>,
    );
    return rows.length === 1;
  }
  if (neonClient) {
    const rows = await query(neonClient);
    return rows.length === 1;
  }
  throw new Error("Database client is not configured.");
};
