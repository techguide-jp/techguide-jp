import { describe, expect, it } from "vitest";
import { buildSettlementNotification } from "$lib/server/notifications/templates";
import { sanitizeEmailPreviewHtml } from "$lib/server/notifications/previewSafety";
import {
  buildNotificationEventKey,
  classifyResendError,
} from "$lib/server/notifications/notificationService";
import { normalizeNotificationLogin } from "$lib/server/notifications/contactRepository";
import { buildNotificationOperationId } from "$lib/server/notifications/notificationOperation";

const operationId = "11111111-1111-4111-8111-111111111111";

describe("email notification templates", () => {
  it("申請メールに対象月・対象者・日時・安全な詳細リンクを含める", () => {
    const message = buildSettlementNotification(
      {
        type: "settlement_submitted",
        operationId,
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
        operationId,
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
  it.each([
    "application_error",
    "internal_server_error",
    "concurrent_idempotent_requests",
    "invalid_idempotent_request",
  ])("%s は送信結果不明として扱う", (name) => {
    expect(classifyResendError(name)).toBe("unknown");
  });

  it("入力拒否は未送信が確定した失敗として扱う", () => {
    expect(classifyResendError("validation_error")).toBe("failed");
  });
});

describe("email notification idempotency", () => {
  it("同じ業務状態から安定した操作IDを生成する", () => {
    const first = buildNotificationOperationId("settlement-paid", "version-1");
    const replay = buildNotificationOperationId("settlement-paid", "version-1");
    const nextVersion = buildNotificationOperationId(
      "settlement-paid",
      "version-2",
    );

    expect(replay).toBe(first);
    expect(nextVersion).not.toBe(first);
  });

  it("GitHub loginは大文字小文字を区別せず正規化する", () => {
    expect(normalizeNotificationLogin(" Hiro3737 ")).toBe("hiro3737");
  });

  it("同じ操作IDのHTTP再送は発生日時が変わっても同じイベントキーになる", () => {
    const base = {
      type: "settlement_paid" as const,
      operationId,
      month: "2026-08",
      assigneeLogin: "Hiro3737",
      workerDisplayName: "Hiro",
      paidOn: "2026-09-14",
    };
    const first = buildNotificationEventKey({
      ...base,
      occurredAt: new Date("2026-08-21T01:02:03Z"),
    });
    const replay = buildNotificationEventKey({
      ...base,
      assigneeLogin: "hiro3737",
      occurredAt: new Date("2026-08-21T01:03:04Z"),
    });
    const nextOperation = buildNotificationEventKey({
      ...base,
      operationId: "22222222-2222-4222-8222-222222222222",
      occurredAt: new Date("2026-08-21T01:03:04Z"),
    });

    expect(replay).toBe(first);
    expect(nextOperation).not.toBe(first);
  });
});
