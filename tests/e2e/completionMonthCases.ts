import { expect, test, type Page } from "@playwright/test";
import { currentJstMonth } from "../../src/lib/month";

export const assignCompletedIssueMonth = async (
  page: Page,
  month: string,
): Promise<void> => {
  await page.goto(`/settlements/${month}`);
  await page.getByRole("button", { name: /精算月を指定/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "完了済みIssueの精算月を指定",
    exact: true,
  });
  await expect(dialog.getByRole("radio")).toHaveCount(1);
  await dialog.getByRole("radio", { name: /#502/ }).check();
  await expect(dialog.getByLabel("精算月", { exact: true })).toHaveValue("");
  await dialog.getByLabel("精算月", { exact: true }).fill(month);
  await expect(dialog.getByLabel("証跡URL", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/techguide-completion-month-desktop.png",
  });
  await dialog.getByRole("button", { name: "指定した月に計上" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText(`${month}分として固定報酬の精算月を登録しました。`),
  ).toBeVisible();
};

export const registerCompletionMonthTests = (): void => {
  test("管理者が完了にしたIssueは作業者の報告なしで完了となり、管理者指定月に計上できる", async ({
    page,
  }) => {
    await page.goto("/__e2e/login");
    const row = page
      .getByRole("row")
      .filter({ hasText: "#502 E2E: 月次申請と承認を確認する" });
    await expect(row.getByText("完了済み", { exact: true })).toBeVisible();
    await expect(
      row.getByRole("button", { name: "完了報告", exact: true }),
    ).toHaveCount(0);
    await page.goto(`/settlements/${currentJstMonth()}/tashua314`);
    await expect(
      page.getByText("完了済み・管理者の精算月指定待ち", { exact: true }),
    ).toBeVisible();
    await assignCompletedIssueMonth(page, "2026-08");
    await expect(
      page.getByRole("button", { name: "精算月を指定（0件）", exact: true }),
    ).toBeVisible();
    await page.goto("/settlements/2026-08/tashua314");
    const fixedRow = page
      .getByRole("row")
      .filter({ hasText: "#502 E2E: 月次申請と承認を確認する" })
      .first();
    await expect(fixedRow).toContainText("￥2,000");
    await expect(
      page.getByText("完了済み・管理者の精算月指定待ち", { exact: true }),
    ).toHaveCount(0);
  });

  test("作業者は精算月を指定できず、完了済みIssueへ直接完了報告しても月が変わらない", async ({
    page,
    baseURL,
  }) => {
    const form = {
      repository: "techguide-jp/akademy_fes",
      issueNumber: "502",
      assigneeLogin: "tashua314",
      settlementMonth: "2026-08",
    };
    await page.goto("/__e2e/login?login=worker");
    const denied = await page.request.post(
      "/settlements/2026-08?/assignCompletionMonth",
      {
        form,
        maxRedirects: 0,
        headers: { origin: baseURL!, accept: "text/html" },
      },
    );
    expect(denied.status()).toBe(303);
    expect(denied.headers().location).toBe("/work");
    await page.goto("/__e2e/login");
    const report = await page.request.post("/work?/reportCompletion", {
      form,
      headers: { origin: baseURL!, accept: "text/html" },
    });
    expect(report.status()).toBe(400);
    expect(await report.text()).toContain("完了報告は不要です");
    await page.goto("/settlements/2026-08");
    await expect(
      page.getByRole("button", { name: "精算月を指定（1件）", exact: true }),
    ).toBeVisible();
  });
};
