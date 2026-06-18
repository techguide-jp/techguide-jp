import { expect, test } from "@playwright/test";

const currentJstMonth = (): string => {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Failed to build current JST month");
  return `${year}-${month}`;
};

test.beforeEach(async ({ request }) => {
  const response = await request.post("/__e2e/reset");
  expect(response.ok()).toBe(true);
});

test.afterEach(async ({ request }) => {
  const response = await request.post("/__e2e/reset");
  expect(response.ok()).toBe(true);
});

test("稼働開始と終了を記録できる", async ({ page }) => {
  await page.goto("/__e2e/login");

  await expect(page).toHaveURL(/\/work$/);
  await expect(
    page.getByRole("heading", { name: "稼働", exact: true }),
  ).toBeVisible();

  const issueRow = page.getByRole("row").filter({
    hasText: "#501 E2E: 稼働開始と終了を確認する",
  });
  await issueRow.getByRole("button", { name: "開始" }).click();

  await expect(page.getByText("稼働を開始し").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "稼働中" })).toBeVisible();
  await page.getByRole("button", { name: "終了" }).click();

  await expect(page.getByText("稼働を終了しました")).toBeVisible();
  await expect(page.getByRole("heading", { name: "稼働ログ" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "修正" }).first(),
  ).toBeVisible();
});

test("本人申請後に管理者が月次承認できる", async ({ page }) => {
  const month = currentJstMonth();
  await page.goto("/__e2e/login");
  await page.goto(`/settlements/${month}/tashua314`);

  await expect(
    page.getByText("#502 E2E: 月次申請と承認を確認する"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "この月の稼働を確定して申請" })
    .click();
  await expect(
    page.getByText(`${month} の稼働を確定して申請しました。`),
  ).toBeVisible();

  await page.goto(`/settlements/${month}`);
  await page.getByRole("link", { name: "承認" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "この内容で承認" }).click();

  await expect(
    page.getByText("tashua314 の月次精算を承認しました。"),
  ).toBeVisible();
  await expect(page.getByText("承認済み")).toBeVisible();
});

test("本人プロフィールを保存して管理者の稼働確認で見られる", async ({
  page,
}) => {
  await page.goto("/__e2e/login");
  await page.goto("/workers/tashua314");

  await page.getByRole("textbox", { name: "表示名" }).fill("たしゅあ E2E");
  await expect(page.getByRole("textbox", { name: "表示名" })).toHaveValue(
    "たしゅあ E2E",
  );
  const skillInput = page.getByRole("textbox", { name: "スキル" });
  await skillInput.fill("SvelteKit");
  await page.getByRole("button", { name: "追加" }).click();
  await skillInput.fill("Drizzle");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(
    page.getByRole("button", { name: "SvelteKit を削除" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Drizzle を削除" }),
  ).toBeVisible();
  await page.getByLabel("得意領域").fill("管理画面");
  await page.getByLabel("稼働目安").fill("平日夜");
  await page.getByLabel("仕事の進め方・希望").fill("短期タスク優先");
  await page.getByRole("button", { name: "プロフィールを保存" }).click();

  await expect(page.getByText("プロフィールを保存しました。")).toBeVisible();

  await page.goto("/admin/work");
  await expect(page.getByRole("heading", { name: "稼働確認" })).toBeVisible();
  await expect(page.getByText("たしゅあ E2E")).toBeVisible();
  await expect(page.getByText("SvelteKit")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "tashua314 をコピー" }).first(),
  ).toBeVisible();
});

test("管理者メモは作業者本人のプロフィールデータに含めない", async ({
  page,
}) => {
  const adminNote = "非公開の評価メモ E2E";

  await page.goto("/__e2e/login");
  await page.goto("/workers/worker-user");
  await page.getByRole("textbox", { name: "メモ" }).fill(adminNote);
  await page.getByRole("button", { name: "管理者メモを保存" }).click();
  await expect(page.getByText("管理者メモを保存しました。")).toBeVisible();

  await page.goto("/__e2e/login?login=worker-user");
  await page.goto("/workers/worker-user");

  await expect(page.getByRole("heading", { name: "管理者メモ" })).toHaveCount(
    0,
  );
  expect(await page.content()).not.toContain(adminNote);
});
