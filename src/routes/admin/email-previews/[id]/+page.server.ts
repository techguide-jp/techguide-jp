import { error } from "@sveltejs/kit";
import { requireAdmin } from "$lib/server/auth/guards";
import { getEmailPreview } from "$lib/server/notifications/previewStore";
import { sanitizeEmailPreviewHtml } from "$lib/server/notifications/previewSafety";

export const load = async (event) => {
  requireAdmin(event);
  const preview = await getEmailPreview(event.params.id);
  if (!preview) throw error(404, "メールプレビューが見つかりません。");
  return {
    metadata: preview.metadata,
    text: preview.text,
    safeHtml: sanitizeEmailPreviewHtml(preview.html),
  };
};
