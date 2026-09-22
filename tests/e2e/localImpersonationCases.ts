import { expect, test } from "@playwright/test";
import postgres from "postgres";

const withDb = async (
  run: (sql: ReturnType<typeof postgres>) => Promise<void>,
) => {
  if (!process.env.DATABASE_URL) throw new Error("テストDBが必要です");
  const sql = postgres(process.env.DATABASE_URL);
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
};

export const registerLocalImpersonationTests = (): void => {
  test("ローカル擬似ログインで本人の編集・月次申請を行い管理者へ戻れる", async ({
    page,
    context,
    baseURL,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await withDb(async (sql) => {
      await sql`INSERT INTO worker_profiles (login, display_name, admin_note) VALUES ('reward-worker', '確認用作業者', '本人へ渡さない管理者メモ')`;
      await sql`INSERT INTO work_sessions (repository, issue_number, issue_title, assignee_login, created_by, started_at, ended_at) VALUES ('techguide-jp/akademy_fes', 504, 'E2E', 'reward-worker', 'reward-worker', '2026-09-20T00:00:00Z', '2026-09-20T01:00:00Z')`;
    });
    await page.goto("/__e2e/login?login=tashua314");
    const adminCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "tg_session",
    )!.value;
    await page.getByRole("link", { name: "ユーザー切替", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "ユーザー切替", exact: true }),
    ).toBeVisible();
    // SSR直後の選択がhydrationで初期値に戻らないよう、画面初期化を待つ。
    await page.waitForLoadState("networkidle");
    const csrf = await page.request.post("/dev/impersonation?/start", {
      form: { login: "reward-worker" },
      headers: { origin: "https://other.example", accept: "text/html" },
      maxRedirects: 0,
    });
    expect(csrf.status()).toBe(403);
    await page.getByLabel("対象ユーザー").selectOption("reward-worker");
    await page.getByRole("button", { name: "このユーザーで確認する" }).click();
    await expect(page).toHaveURL(/\/work$/);
    const banner = page.getByRole("complementary", {
      name: "ローカルの擬似ログイン",
    });
    await expect(banner).toContainText("reward-worker として擬似ログイン中");
    await expect(
      page.getByRole("link", { name: "月次一覧", exact: true }),
    ).toHaveCount(0);
    expect(
      (await context.cookies()).find((cookie) => cookie.name === "tg_session")!
        .value,
    ).toBe(adminCookie);
    await page.setViewportSize({ width: 527, height: 863 });
    await expect(
      banner.getByRole("button", { name: "管理者に戻る" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(527);
    await page.goto("/admin/workers");
    await expect(page).toHaveURL(/\/work$/);
    const denied = await page.request.post("/settlements/2026-09?/approve", {
      form: { assigneeLogin: "reward-worker" },
      maxRedirects: 0,
      headers: { origin: baseURL!, accept: "text/html" },
    });
    expect(denied.status()).toBe(303);
    expect(denied.headers().location).toBe("/work");
    await page.getByRole("link", { name: "プロフィール", exact: true }).click();
    await expect(page).toHaveURL(/\/workers\/reward-worker$/);
    await expect(page.getByText("本人へ渡さない管理者メモ")).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "表示名", exact: true })
      .fill("擬似ログインで編集した表示名");
    await page
      .getByRole("button", { name: "プロフィールを保存", exact: true })
      .click();
    await expect(
      page.getByText("プロフィールを保存しました。", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "表示名", exact: true }),
    ).toHaveValue("擬似ログインで編集した表示名");
    await page.goto("/settlements/2026-09/reward-worker");
    await page
      .getByRole("button", { name: "この月の稼働を確定して申請", exact: true })
      .click();
    await expect(
      page.getByText("2026-09 の稼働を確定して申請しました。", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "変更なしで閉じる", exact: true })
      .click();
    await banner.getByRole("button", { name: "管理者に戻る" }).click();
    await expect(page).toHaveURL(/\/dev\/impersonation$/);
    await expect(banner).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "月次一覧", exact: true }),
    ).toBeVisible();
    expect(
      (await context.cookies()).find((cookie) => cookie.name === "tg_session")!
        .value,
    ).toBe(adminCookie);
    await withDb(async (sql) => {
      const [submission] =
        await sql`SELECT submitted_by FROM monthly_work_submissions WHERE assignee_login = 'reward-worker' AND month = '2026-09'`;
      expect(submission.submitted_by).toBe("reward-worker");
      const [sessions] =
        await sql`SELECT count(*)::int AS count FROM auth_sessions WHERE github_login = 'reward-worker'`;
      expect(sessions.count).toBe(0);
      const logs =
        await sql`SELECT action, actor_login FROM audit_logs WHERE action IN ('local_impersonation_started', 'local_impersonation_stopped') ORDER BY created_at`;
      expect(logs.map((log) => [log.action, log.actor_login])).toEqual([
        ["local_impersonation_started", "tashua314"],
        ["local_impersonation_stopped", "tashua314"],
      ]);
    });
    expect(errors).toEqual([]);
  });

  test("通常ユーザーは擬似ログイン画面と直接POSTを利用できない", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/__e2e/login?login=reward-worker");
    await expect(
      page.getByRole("link", { name: "ユーザー切替", exact: true }),
    ).toHaveCount(0);
    const response = await page.goto("/dev/impersonation");
    expect(response!.status()).toBe(404);
    const denied = await page.request.post("/dev/impersonation?/start", {
      form: { login: "tashua314" },
      maxRedirects: 0,
      headers: { origin: baseURL!, accept: "text/html" },
    });
    expect(denied.status()).toBe(404);
  });
};
