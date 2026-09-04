import { neonClient, postgresClient } from "$lib/server/db/client";
import { db } from "$lib/server/db/client";
import { emailNotificationEvents } from "$lib/server/db/schema";
import type { SettlementNotificationInput } from "$lib/server/notifications/notificationTypes";
import { buildNotificationEventKey } from "$lib/server/notifications/notificationService";
import {
  notificationInsertQuery,
  type PreparedNotificationWrite,
  type SqlTag,
} from "$lib/server/notifications/notificationWrite";

/** Cronなど、他の業務更新と同一トランザクションに束ねない通知を冪等に保存する。 */
export const insertPreparedNotification = async (
  notification: PreparedNotificationWrite,
): Promise<boolean> => {
  const result = postgresClient
    ? await notificationInsertQuery(
        postgresClient as unknown as SqlTag<unknown>,
        notification,
      )
    : neonClient
      ? await notificationInsertQuery(
          neonClient as unknown as SqlTag<unknown>,
          notification,
        )
      : null;
  if (!result) throw new Error("Database client is not configured.");
  return Array.isArray(result) && result.length > 0;
};

/** プレビュー環境でもCronの一意キーをDBに残し、同じ通知を再生成しない。 */
export const insertNotificationEventMarker = async (
  input: SettlementNotificationInput,
): Promise<boolean> => {
  const rows = await db
    .insert(emailNotificationEvents)
    .values({
      eventKey: buildNotificationEventKey(input),
      type: input.type,
      month: input.month,
      assigneeLogin: input.assigneeLogin,
      occurredAt: input.occurredAt,
      payload: { previewOnly: true },
    })
    .onConflictDoNothing({ target: emailNotificationEvents.eventKey })
    .returning();
  return rows.length > 0;
};
