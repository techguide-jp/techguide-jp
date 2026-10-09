import { expect, test } from "@playwright/test";
import postgres from "postgres";

const profileUrl = "/workers/worker-user";
const email = "worker-contact@example.com";

export const registerWorkerNotificationContactTests = (): void => {
  test("管理者と本人がプロフィールのメール通知先を確認でき、他者には渡さない", async ({
    page,
    context,
  }) => {
    if (!process.env.DATABASE_URL) throw new Error("テストDBが必要です。");
    const sql = postgres(process.env.DATABASE_URL);
    try {
      await sql`
        INSERT INTO user_notification_contacts (github_login, email, synced_at)
        VALUES ('worker-user', ${email}, '2026-10-09T00:00:00Z')
      `;
    } finally {
      await sql.end();
    }

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/__e2e/login?login=worker-user");
    await page.goto(profileUrl);
    await expect(
      page.getByRole("heading", { name: "メール通知先" }),
    ).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();

    await page.goto("/__e2e/login");
    await page.goto("/admin/workers");
    await page
      .getByRole("row")
      .filter({ hasText: "worker-user" })
      .getByRole("link", { name: "プロフィール" })
      .click();
    await expect(
      page.getByRole("heading", { name: "メール通知先" }),
    ).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByText(/最終同期:/)).toBeVisible();
    await expect(page.getByText(/ワーカー本人が一度ログアウト/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "プロフィールを保存" }),
    ).toHaveCount(0);

    const ssr = await page.request.get(profileUrl);
    expect(ssr.ok()).toBe(true);
    expect(await ssr.text()).toContain(email);

    await page.goto("/__e2e/login?login=other-worker");
    const denied = await page.request.get(profileUrl, { maxRedirects: 0 });
    expect(denied.status()).toBe(303);
    expect(denied.headers().location).toBe("/work");
    expect(await denied.text()).not.toContain(email);
    const deniedData = await page.request.get(`${profileUrl}/__data.json`, {
      maxRedirects: 0,
    });
    expect(await deniedData.text()).not.toContain(email);
    await page.goto(profileUrl);
    await expect(page).toHaveURL(/\/work$/);

    await context.clearCookies();
    const anonymous = await page.request.get(profileUrl, { maxRedirects: 0 });
    expect(anonymous.status()).toBe(303);
    expect(anonymous.headers().location).toBe("/login");
    expect(await anonymous.text()).not.toContain(email);
    expect(pageErrors).toEqual([]);
  });

  test("管理者にメール通知先が未同期であることを表示する", async ({ page }) => {
    await page.goto("/__e2e/login?login=worker-user");
    await page.goto("/__e2e/login");
    await page.goto(profileUrl);
    await expect(
      page.getByRole("heading", { name: "メール通知先" }),
    ).toBeVisible();
    await expect(
      page.getByText("通知先はまだ同期されていません。"),
    ).toBeVisible();
  });
};
