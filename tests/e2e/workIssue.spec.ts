import { expect, test } from "@playwright/test";

const issuePath = "/work/techguide-jp/akademy_fes/501";
test.beforeEach(async ({ request }) => {
  expect((await request.post("/__e2e/reset")).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  expect((await request.post("/__e2e/reset")).ok()).toBe(true);
});

test("案件URLをログインへ引き継ぎ、権限外の本文を表示しない", async ({
  page,
}) => {
  await page.goto(issuePath);
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(
    page.getByText("ログイン後に、依頼された案件を表示します。"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "GitHubでログイン" }),
  ).toHaveAttribute(
    "href",
    /returnTo=%2Fwork%2Ftechguide-jp%2Fakademy_fes%2F501/,
  );
  await page.goto("/__e2e/login?login=other-worker");
  const response = await page.goto(issuePath);
  expect(response?.status()).toBe(404);
  await expect(
    page.getByText("担当者設定を依頼者に確認してください。", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "依頼内容" })).toHaveCount(0);
});

test("案件詳細から稼働開始・終了・完了報告を行える", async ({ page }) => {
  await page.goto("/__e2e/login");
  await page
    .getByRole("link", {
      name: "#501 E2E: 稼働開始と終了を確認する",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`${issuePath}$`));
  await expect(
    page.getByRole("heading", { name: "依頼内容", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "完了条件", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1,000円", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "稼働を開始", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "稼働を終了", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "完了報告", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "稼働を終了", exact: true }).click();
  await expect(
    page.getByText("稼働を終了しました。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "完了報告", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "完了報告を取り下げ", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "完了報告を取り下げ", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "完了報告", exact: true }),
  ).toBeVisible();
});

test("管理者が依頼文とURLをコピーでき、担当外案件は閲覧だけできる", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/__e2e/login");
  await page.goto("/admin/work");
  const row = page
    .getByRole("row")
    .filter({ hasText: "#504 E2E: ハイブリッドの表示確認" });
  await row.getByRole("button", { name: "依頼文＋URLをコピー" }).click();
  await expect(
    row.getByRole("button", { name: "コピーしました" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => globalThis.navigator.clipboard.readText()),
  ).toContain("http://127.0.0.1:4173/work/techguide-jp/akademy_fes/504");
  await row
    .getByRole("link", { name: "#504 E2E: ハイブリッドの表示確認" })
    .click();
  await expect(
    page.getByText("管理者として閲覧中です。", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "稼働を開始" })).toHaveCount(0);
  await expect(page.getByText("30,000円", { exact: true })).toBeVisible();
});

test("コピーが拒否されたら手動用の文面を表示し、スマートフォンで横にはみ出さない", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
      configurable: true,
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/__e2e/login");
  await page.goto(issuePath);
  await page.getByRole("button", { name: "依頼文＋URLをコピー" }).click();
  await expect(
    page.getByRole("textbox", { name: "手動コピー用の依頼文" }),
  ).toHaveValue(/内容・報酬・完了条件はこちらです。/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  ).toBe(true);
});
