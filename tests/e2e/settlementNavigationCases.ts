import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { currentJstMonth } from "../../src/lib/month";
import { assignCompletedIssueMonth } from "./completionMonthCases";

export const registerSettlementNavigationTests = (): void => {
  test("同じIssueに未処理申請が複数あっても自分の精算へ一度で遷移しナビを維持する", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const month = currentJstMonth();
    await page.goto("/__e2e/login");
    await assignCompletedIssueMonth(page, month);
    await page.goto(`/settlements/${month}/tashua314`);
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("link", { name: "月次確定申請をする", exact: true })
      .click();
    await page
      .getByRole("button", { name: "この内容で月次確定申請", exact: true })
      .click();
    await page
      .getByRole("button", { name: "変更なしで閉じる", exact: true })
      .click();

    if (!process.env.DATABASE_URL) throw new Error("テストDBが必要です");
    const sql = postgres(process.env.DATABASE_URL);
    try {
      for (const reason of ["修正A", "修正B"]) {
        await sql`INSERT INTO work_log_change_requests (repository, issue_number, issue_title, assignee_login, request_type, requested_started_at, requested_ended_at, reason, requested_by) VALUES ('techguide-jp/akademy_fes', 502, 'E2E', 'tashua314', 'add', ${month + "-20T00:00:00Z"}, ${month + "-20T01:00:00Z"}, ${reason}, 'tashua314')`;
      }
    } finally {
      await sql.end();
    }
    await page.goto("/work");
    await page.waitForLoadState("networkidle");
    const nav = page.getByRole("navigation", { name: "主要ナビゲーション" });
    await nav.getByRole("link", { name: "自分の精算", exact: true }).click();
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
    await expect(page).toHaveURL(`/settlements/${month}/tashua314`);
    await expect(
      page.getByRole("heading", { name: "月次確定申請", exact: true }),
    ).toBeVisible();
    const warning = "未処理の修正申請: techguide-jp/akademy_fes#502";
    await expect(
      page.getByRole("heading", { name: "稼働時刻の管理者の確認待ち" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "techguide-jp/akademy_fes#502" }),
    ).toHaveCount(1);
    await expect(page.getByText("申請前に確認が必要です")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "要確認", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('form[action="?/submitWork"], textarea'),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "変更内容で再申請", exact: true }),
    ).toHaveCount(0);
    for (const name of [
      "稼働",
      "自分の精算",
      "プロフィール",
      "月次一覧",
      "ログアウト",
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await nav.getByRole("link", { name: "プロフィール", exact: true }).click();
    await expect(page).toHaveURL("/workers/tashua314");
    await nav.getByRole("link", { name: "自分の精算", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "月次確定申請", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(
      nav.getByRole("link", { name: "自分の精算", exact: true }),
    ).toBeVisible();
    await nav.getByRole("link", { name: "月次一覧", exact: true }).click();
    await expect(page.getByText("修正A", { exact: true })).toBeVisible();
    await expect(page.getByText("修正B", { exact: true })).toBeVisible();
    await page.goto(`/settlements/${month}#approve-tashua314`);
    await page.waitForLoadState("networkidle");
    const dialog = page.getByRole("dialog", {
      name: "tashua314 の月次承認",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("listitem").filter({ hasText: warning }),
    ).toHaveCount(2);
    await expect(
      dialog.getByRole("button", { name: "この内容で承認", exact: true }),
    ).toBeDisabled();
    expect(errors).toEqual([]);
  });
};
