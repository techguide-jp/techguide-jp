import { expect, test } from "@playwright/test";
import {
  addMonths,
  currentJstMonth,
  formatMonthLabel,
} from "../../src/lib/month";
import { preferenceQuestions } from "../../src/lib/workerPreferences";

const letterPath = "/admin/email-previews/monthly-letter";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/__e2e/reset")).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  expect((await request.post("/__e2e/reset")).ok()).toBe(true);
});

test("翌月のお手紙を管理者が保存でき、他の画面からの上書きと作業者の保存を拒否する", async ({
  page,
  context,
  baseURL,
}) => {
  const sendMonth = addMonths(currentJstMonth(), 1);
  await page.goto("/__e2e/login");
  await page.getByRole("link", { name: "管理モード" }).click();
  await page.getByRole("link", { name: "メール通知", exact: true }).click();
  await page.getByRole("link", { name: "翌月配信のお手紙を書く" }).click();
  await expect(
    page.getByText(`${formatMonthLabel(sendMonth)}1日 9時台（日本時間）に配信`),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");

  const preview = page.frameLocator(
    'iframe[title="月次メールの本文プレビュー"]',
  );
  const status = page.getByLabel("申請状況", { exact: true });
  await expect(
    preview.getByText("TechGuideの業務にお力添え", { exact: false }),
  ).toBeVisible();
  for (const [value, text] of [
    ["required", "月次確定申請がまだ提出されていません"],
    ["submitted", "月次確定申請は提出済みです"],
    ["approved", "月次精算は承認済みです"],
    ["not_required", "月次確定申請の対象となる精算がありません"],
  ]) {
    await status.selectOption(value);
    await expect(preview.getByText(text, { exact: false })).toBeVisible();
    await expect(
      preview.getByText("月次精算を確認・申請する", { exact: true }),
    ).toHaveCount(value === "required" ? 1 : 0);
  }
  await page.getByRole("link", { name: "希望アンケートの設問を見る" }).click();
  const survey = page.getByRole("region", { name: "希望アンケートの設問" });
  for (const question of Object.values(preferenceQuestions)) {
    await expect(survey.getByText(question, { exact: false })).toBeVisible();
  }

  const other = await context.newPage();
  await other.goto(letterPath);
  await page
    .getByRole("textbox", { name: "本文" })
    .fill("今月のお手紙\nいつもありがとうございます。");
  await expect(
    preview.getByText("今月のお手紙", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "お手紙を保存" }).click();
  await expect(page.getByRole("status")).toHaveText("お手紙を保存しました。");
  await other.getByRole("textbox", { name: "本文" }).fill("古い画面の入力");
  await other.getByRole("button", { name: "お手紙を保存" }).click();
  await expect(other.getByRole("status")).toContainText(
    "別の画面で本文が更新されました",
  );
  await expect(other.getByRole("textbox", { name: "本文" })).toHaveValue(
    "古い画面の入力",
  );
  await other.close();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "本文" })).toHaveValue(
    "今月のお手紙\nいつもありがとうございます。",
  );

  await page.goto("/__e2e/login?login=worker");
  const denied = await page.request.post(`${letterPath}?/save`, {
    form: { sendMonth, version: 1, body: "権限外の入力" },
    headers: { origin: baseURL!, accept: "text/html" },
    maxRedirects: 0,
  });
  expect(denied.status()).toBe(303);
  expect(denied.headers().location).toBe("/work");
  await page.goto("/work/preferences");
  await expect(page).toHaveURL("/workers/worker#preferences-heading");
  await expect(page.getByRole("heading", { name: "現在の希望" })).toBeVisible();
});
