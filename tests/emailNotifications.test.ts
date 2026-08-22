import { describe, expect, it } from "vitest";
import { buildSettlementNotification } from "$lib/server/notifications/templates";
import { sanitizeEmailPreviewHtml } from "$lib/server/notifications/previewSafety";
import { classifyResendError } from "$lib/server/notifications/notificationService";

describe("email notification templates", () => {
  it("申請メールに対象月・対象者・日時・安全な詳細リンクを含める", () => {
    const message = buildSettlementNotification(
      {
        type: "settlement_submitted",
        month: "2026-08",
        assigneeLogin: "worker",
        workerDisplayName: "<Worker>",
        occurredAt: new Date("2026-08-21T01:02:03Z"),
      },
      "https://example.com",
    );
    expect(message.subject).toContain("月次確定申請");
    expect(message.text).toContain("2026-08");
    expect(message.text).toContain("@worker");
    expect(message.html).toContain("&lt;Worker&gt;");
    expect(message.html).toContain(
      "https://example.com/settlements/2026-08/worker",
    );
  });

  it("承認メールに予定日と通知書導線を含める", () => {
    const message = buildSettlementNotification(
      {
        type: "settlement_approved",
        month: "2026-08",
        assigneeLogin: "worker",
        workerDisplayName: "Worker",
        occurredAt: new Date("2026-08-21T01:02:03Z"),
        scheduledDate: "2026-09-14",
        hasPaymentNotice: true,
      },
      "https://example.com/",
      "support@example.com",
    );
    expect(message.text).toContain("支払い予定日: 2026-09-14");
    expect(message.text).toContain("/notice");
    expect(message.text).not.toContain("返信できません");
  });
});

describe("email preview safety", () => {
  it("script・フォーム・イベント属性・危険なURLを無効化する", () => {
    const safe = sanitizeEmailPreviewHtml(
      '<script>alert(1)</script><form action="/x"><button>送信</button></form><a href="javascript:alert(1)" onclick="alert(1)">bad</a><a href="https://example.com">safe</a>',
    );
    expect(safe).not.toContain("<script");
    expect(safe).not.toContain("<form");
    expect(safe).not.toContain("onclick");
    expect(safe).not.toContain("javascript:");
    expect(safe).toContain('target="_blank"');
    expect(safe).toContain('rel="noopener noreferrer"');
  });
});

describe("Resend error classification", () => {
  it.each(["application_error", "internal_server_error", "conflict"])(
    "%s は送信結果不明として扱う",
    (name) => {
      expect(classifyResendError(name)).toBe("unknown");
    },
  );

  it("入力拒否は未送信が確定した失敗として扱う", () => {
    expect(classifyResendError("validation_error")).toBe("failed");
  });
});
