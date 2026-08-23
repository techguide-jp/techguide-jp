import { requireAdmin } from "$lib/server/auth/guards";
import { listRecentEmailDeliveries } from "$lib/server/notifications/deliveryRepository";
import { listEmailPreviews } from "$lib/server/notifications/previewStore";
import { env } from "$lib/server/env";
import { fail } from "@sveltejs/kit";
import { cleanupEmailPreviews } from "$lib/server/notifications/previewStore";
import {
  reconcileStaleEmailDeliveries,
  retryEmailDelivery,
} from "$lib/server/notifications/notificationService";
import {
  createTestEmailPreview,
  isNotificationType,
} from "$lib/server/notifications/testPreviewService";

export const load = async (event) => {
  requireAdmin(event);
  return {
    deliveryMode: env.emailDeliveryMode,
    previews: await listEmailPreviews(),
    deliveries:
      env.emailDeliveryMode === "preview"
        ? []
        : await listRecentEmailDeliveries(),
  };
};

export const actions = {
  createTestPreview: async (event) => {
    const user = requireAdmin(event);
    const type = String((await event.request.formData()).get("type") ?? "");
    if (!isNotificationType(type)) {
      return fail(400, { scope: "preview", message: "通知種別が不正です。" });
    }
    const result = await createTestEmailPreview(
      type,
      user.login,
      event.url.origin,
    );
    if (!result.ok)
      return fail(400, { scope: "preview", message: result.message });
    return {
      scope: "preview",
      message: "動作確認用のメールプレビューを生成しました。",
    };
  },
  cleanup: async (event) => {
    requireAdmin(event);
    const deletedCount = await cleanupEmailPreviews();
    return {
      scope: "preview",
      message: `${deletedCount}件の古いプレビューを削除しました。`,
    };
  },
  retry: async (event) => {
    requireAdmin(event);
    const id = String((await event.request.formData()).get("deliveryId") ?? "");
    const result = await retryEmailDelivery(id);
    if (!result.ok)
      return fail(400, { scope: "delivery", message: result.message });
    return {
      scope: "delivery",
      message: "同じ冪等キーで配送処理を実行しました。",
    };
  },
  reconcile: async (event) => {
    requireAdmin(event);
    const updatedCount = await reconcileStaleEmailDeliveries();
    return {
      scope: "delivery",
      message: `${updatedCount}件の長時間送信中の配送を要確認に変更しました。`,
    };
  },
};
