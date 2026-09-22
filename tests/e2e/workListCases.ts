import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { currentJstMonth } from "../../src/lib/month";

export const registerWorkListTests = (): void => {
  test("稼働ログを更新順で折りたたみ、修正申請中と月次申請後は編集を拒否する", async ({
    page,
    baseURL,
  }) => {
    if (!process.env.DATABASE_URL) throw new Error("テストDBが必要です");
    const month = currentJstMonth();
    const sql = postgres(process.env.DATABASE_URL);
    let newestId = "";
    try {
      for (let index = 1; index <= 8; index++) {
        const [row] =
          await sql`INSERT INTO work_sessions (repository, issue_number, issue_title, assignee_login, created_by, started_at, ended_at, updated_at) VALUES ('techguide-jp/akademy_fes', 504, ${"ログ" + index}, 'reward-worker', 'reward-worker', ${month + "-01T00:00:00Z"}, ${month + "-01T01:00:00Z"}, ${month + "-" + String(index).padStart(2, "0") + "T00:00:00Z"}) RETURNING id`;
        newestId = row.id;
      }
    } finally {
      await sql.end();
    }
    await page.goto("/__e2e/login?login=reward-worker");
    await page.waitForLoadState("networkidle");
    const logs = page.getByRole("region", { name: "稼働ログ", exact: true });
    const visibleRows = logs.locator("tbody tr:visible");
    await expect(visibleRows).toHaveCount(5);
    expect(await visibleRows.allTextContents()).toEqual(
      [8, 7, 6, 5, 4].map((n) => expect.stringContaining(`ログ${n}`)),
    );
    await logs
      .getByText("過去の稼働ログを表示（3件）", { exact: true })
      .click();
    await expect(visibleRows).toHaveCount(8);
    await logs
      .getByText("過去の稼働ログを表示（3件）", { exact: true })
      .click();
    const newest = logs.getByRole("row").filter({ hasText: "ログ8" });
    await newest.getByRole("button", { name: "修正", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("理由").fill("時刻確認待ちのテスト");
    await dialog.getByRole("button", { name: "申請", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(newest).toContainText("稼働時刻の管理者の確認待ち");
    await expect(newest.getByRole("button")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "管理者の承認後に月次確定申請してください",
      }),
    ).toBeVisible();

    const postChange = async () =>
      page.request.post("/work?/requestChange", {
        headers: { origin: baseURL!, accept: "text/html" },
        form: {
          requestType: "exclude",
          issueKey: "techguide-jp/akademy_fes#504",
          targetSessionId: newestId,
          reason: "直接POSTの検証",
        },
      });
    expect((await postChange()).status()).toBe(400);
    const history = page.getByRole("region", { name: "稼働ログの申請履歴" });
    await history
      .getByRole("button", { name: "申請を取り消す", exact: true })
      .click();
    await expect(
      newest.getByRole("button", { name: "修正", exact: true }),
    ).toBeVisible();
    await newest.getByRole("button", { name: "修正", exact: true }).click();
    await dialog.getByLabel("理由").fill("別画面の申請と競合しても残す入力");
    expect((await postChange()).status()).toBe(200);
    await dialog.getByRole("button", { name: "申請", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("管理者の確認待ち");
    await expect(dialog.getByLabel("理由")).toHaveValue(
      "別画面の申請と競合しても残す入力",
    );
    await dialog
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    await history
      .getByRole("button", { name: "申請を取り消す", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "次は月次確定申請です" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "精算内容を確認して申請する" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/settlements/${month}/reward-worker#monthly-submission-panel-heading$`,
      ),
    );
    await page
      .getByRole("link", { name: "月次確定申請をする", exact: true })
      .click();
    await page
      .getByRole("button", { name: "この内容で月次確定申請", exact: true })
      .click();
    await page
      .getByRole("button", { name: "変更なしで閉じる", exact: true })
      .click();
    await page.goto("/work");
    await expect(newest).toContainText("月次確定申請済み・編集不可");
    await expect(logs.getByRole("button", { name: /修正|除外/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("heading", { name: "次は月次確定申請です" }),
    ).toHaveCount(0);
    expect((await postChange()).status()).toBe(400);
  });

  test("Project内Issueは更新順で、完了済みの2件目以降を展開できる", async ({
    page,
  }, testInfo) => {
    await page.goto("/__e2e/login?login=list-worker");
    await page.waitForLoadState("networkidle");
    const issues = page.getByRole("region", {
      name: "Project内Issue",
      exact: true,
    });
    const rows = issues.locator("tbody tr:visible");
    expect(await rows.allTextContents()).toEqual(
      [510, 508].map((n) => expect.stringContaining(`#${n}`)),
    );
    await issues
      .getByText("過去の完了済みIssueを表示（2件）", { exact: true })
      .click();
    expect(await rows.allTextContents()).toEqual(
      [510, 508, 509, 507].map((n) => expect.stringContaining(`#${n}`)),
    );
    await issues
      .getByText("過去の完了済みIssueを表示（2件）", { exact: true })
      .click();
    await expect(rows).toHaveCount(2);
    await page.setViewportSize({ width: 527, height: 863 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(527);
    await issues.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("work-issues-collapsed.png"),
    });
  });
};
