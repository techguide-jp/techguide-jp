import { expect, test } from "@playwright/test";
import { registerPaymentCommentTests } from "./paymentCommentCases";

registerPaymentCommentTests();

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

test("稼働画面で完了報告を提出・取り下げできる", async ({ page }) => {
  const month = currentJstMonth();
  await page.goto("/__e2e/login");
  const issueRow = page.getByRole("row").filter({
    hasText: "#501 E2E: 稼働開始と終了を確認する",
  });

  await issueRow.getByRole("button", { name: "開始", exact: true }).click();
  await page.getByRole("button", { name: "終了", exact: true }).click();
  await issueRow.getByRole("button", { name: "完了報告", exact: true }).click();

  await expect(
    page.getByText(`${month}分として完了報告しました。`),
  ).toBeVisible();
  await expect(
    issueRow.getByRole("button", { name: "完了報告を取り下げ" }),
  ).toBeVisible();
  await page.goto(`/settlements/${month}/tashua314`);
  await expect(page.getByText("Issue完了待ち").first()).toBeVisible();

  await page.goto("/work");
  await issueRow.getByRole("button", { name: "完了報告を取り下げ" }).click();
  await expect(page.getByText("完了報告を取り下げました。")).toBeVisible();
  await expect(
    issueRow.getByRole("button", { name: "完了報告", exact: true }),
  ).toBeVisible();
});

test("本人申請後に管理者が月次承認できる", async ({ page }) => {
  const month = currentJstMonth();
  await page.goto("/__e2e/login");
  await page.goto("/workers/tashua314");
  await page
    .getByRole("textbox", { name: "宛名（名前・屋号・会社名）" })
    .fill("株式会社テックガイド");
  await page.getByRole("textbox", { name: "郵便番号" }).fill("1500001");
  await page
    .getByRole("textbox", { name: "住所" })
    .fill("東京都渋谷区神南1-2-3");
  await page.getByRole("textbox", { name: "金融機関名" }).fill("テスト銀行");
  await page.getByRole("textbox", { name: "支店名" }).fill("本店");
  await page.getByLabel("口座種別").selectOption("ordinary");
  await page.getByRole("textbox", { name: "口座番号" }).fill("0123456");
  await page.getByRole("textbox", { name: "口座名義" }).fill("テックガイド");
  await page.getByRole("button", { name: "振込先情報を保存" }).click();
  await expect(page.getByText("振込先情報を保存しました。")).toBeVisible();

  await page.goto("/work");
  const completedIssueRow = page.getByRole("row").filter({
    hasText: "#502 E2E: 月次申請と承認を確認する",
  });
  await completedIssueRow
    .getByRole("button", { name: "完了報告", exact: true })
    .click();
  await expect(
    page.getByText(`${month}分として完了報告しました。`),
  ).toBeVisible();

  await page.goto(`/settlements/${month}/tashua314`);

  await expect(
    page.getByText("#502 E2E: 月次申請と承認を確認する").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "この月の稼働を確定して申請" })
    .click();
  await expect(
    page.getByText(`${month} の稼働を確定して申請しました。`),
  ).toBeVisible();

  await page.goto(`/settlements/${month}`);
  const settlementRow = page.getByRole("row").filter({ hasText: "tashua314" });
  await expect(
    settlementRow.getByRole("link", { name: "通知書を見る", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "承認" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "この内容で承認" }).click();

  await expect(
    page.getByText("tashua314 の月次精算を承認しました。"),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("承認済み")).toBeVisible();
  const noticeLink = settlementRow.getByRole("link", {
    name: "通知書を見る",
    exact: true,
  });
  await expect(noticeLink).toBeVisible();
  await noticeLink.click();
  await expect(page).toHaveURL(
    new RegExp(`/settlements/${month}/tashua314/notice$`),
  );
  await expect(
    page.getByRole("heading", { name: "支払い通知書", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "通知書を再作成", exact: true })
    .click();
  await expect(page.getByText("支払い通知書を再作成しました。")).toBeVisible();
  await expect(
    page.getByText("#502 E2E: 月次申請と承認を確認する").first(),
  ).toBeVisible();

  await page.goto(`/settlements/${month}/tashua314`);
  const detailNoticeLink = page.getByRole("link", {
    name: "支払い通知書を確認する",
    exact: true,
  });
  await expect(detailNoticeLink).toBeVisible();
  await expect(detailNoticeLink).toHaveClass(/button/);
  await expect(detailNoticeLink).toHaveClass(/primary/);
  await page
    .getByLabel("作業者へのコメント（任意）")
    .fill("通知書には含めない支払い連絡");
  await page.getByRole("button", { name: "支払い済みにする" }).click();
  await expect(page.locator(".payment-comment")).toHaveText(
    "通知書には含めない支払い連絡",
  );
  await detailNoticeLink.click();
  await expect(
    page.getByRole("heading", { name: "支払い通知書", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("通知書には含めない支払い連絡")).toHaveCount(0);
});

test("管理者が動作確認用メールプレビューを生成して確認できる", async ({
  page,
}) => {
  await page.goto("/__e2e/login");
  await page.goto("/admin/email-previews");

  await page.getByRole("button", { name: "申請通知を生成" }).click();
  await expect(
    page.getByText("動作確認用のメールプレビューを生成しました。"),
  ).toBeVisible();

  const previewLink = page.getByRole("link", {
    name: /\[動作確認\].*月次確定申請/,
  });
  await expect(previewLink).toBeVisible();
  await previewLink.click();
  await expect(
    page.getByRole("heading", { name: /\[動作確認\].*月次確定申請/ }),
  ).toBeVisible();
  await expect(page.getByText("未同期")).toBeVisible();
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
  const assignmentNote = page.getByLabel("仕事の進め方・希望");
  await assignmentNote.fill("短期タスク優先");
  await page.getByRole("button", { name: "希望例" }).click();
  await expect(page.getByRole("heading", { name: "希望例" })).toBeVisible();
  await page
    .getByRole("button", {
      name: /AI API \/ LLM 連携の実装に挑戦したい/,
    })
    .click();
  await expect(assignmentNote).toHaveValue(
    /短期タスク優先\nAI API \/ LLM 連携の実装に挑戦したい/,
  );
  await page.mouse.click(20, 20);
  await expect(page.getByRole("dialog", { name: "希望例" })).toHaveCount(0);
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

test("本人がSlack IDを保存し管理者が登録者一覧で確認できる", async ({
  page,
}) => {
  await page.goto("/__e2e/login?login=worker-user");
  await page.goto("/workers/worker-user");
  await page
    .getByRole("textbox", { name: "SlackメンバーID（任意）" })
    .fill("  u012abc3456  ");
  await page.getByRole("button", { name: "プロフィールを保存" }).click();

  await expect(page.getByText("プロフィールを保存しました。")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "SlackメンバーID（任意）" }),
  ).toHaveValue("U012ABC3456");

  await page.goto("/__e2e/login");
  await page.goto("/admin/workers");
  await expect(page.getByRole("heading", { name: "登録者一覧" })).toBeVisible();
  const workerRow = page.getByRole("row").filter({ hasText: "worker-user" });
  await expect(workerRow.getByText("U012ABC3456")).toBeVisible();
  await workerRow.getByRole("link", { name: "プロフィール" }).click();
  await expect(page.getByText("U012ABC3456")).toBeVisible();

  await page.goto("/__e2e/login?login=worker-user");
  await page.goto("/admin/workers");
  await expect(page).toHaveURL(/\/work$/);
});

test("本人が振込先を登録し管理者が確認できる", async ({ page }) => {
  const month = currentJstMonth();
  const accountNumber = "0123456";

  await page.goto("/__e2e/login?login=worker-user");
  await page.goto("/workers/worker-user");
  await page
    .getByRole("textbox", { name: "宛名（名前・屋号・会社名）" })
    .fill("山田 太郎");
  await page.getByRole("textbox", { name: "郵便番号" }).fill("1500001");
  await page
    .getByRole("textbox", { name: "住所" })
    .fill("東京都渋谷区神南1-2-3");
  await page.getByRole("textbox", { name: "金融機関名" }).fill("テスト銀行");
  await page.getByRole("textbox", { name: "支店名" }).fill("本店");
  await page.getByLabel("口座種別").selectOption("ordinary");
  await page.getByRole("textbox", { name: "口座番号" }).fill(accountNumber);
  await page.getByRole("textbox", { name: "口座名義" }).fill("ヤマダ タロウ");
  await page.getByRole("button", { name: "振込先情報を保存" }).click();
  await expect(page.getByText("振込先情報を保存しました。")).toBeVisible();

  await page.goto(`/settlements/${month}/worker-user`);
  await expect(page.getByText("登録済み")).toBeVisible();
  expect(await page.content()).not.toContain(accountNumber);

  await page.goto("/__e2e/login");
  await page.goto("/workers/worker-user");
  await expect(page.getByText(accountNumber)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "振込先情報を保存" }),
  ).toHaveCount(0);
});

test("他者は振込先ページへアクセスできない", async ({ page }) => {
  await page.goto("/__e2e/login?login=worker-user");
  await page.goto("/workers/tashua314");
  await expect(page).toHaveURL(/\/work$/);
});

test("作業者が着手前にIssueの報酬条件を確認できる", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto("/__e2e/login?login=reward-worker");
  const ssrHtml = await response?.text();
  expect(ssrHtml).toContain("固定報酬（税抜）");
  expect(ssrHtml).toContain("30,000円");
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole("row").filter({ hasText: "#501 " })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "稼働確認", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "登録者一覧", exact: true }),
  ).toHaveCount(0);

  for (const name of [
    "固定報酬（税抜）",
    "時給（税抜）",
    "追加精算上限（税抜）",
  ]) {
    await expect(
      page.getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("columnheader", { name: "単価", exact: true }),
  ).toHaveCount(0);

  const examples = [
    { issue: 503, mode: "固定", values: ["30,000円", "対象外", "対象外"] },
    {
      issue: 504,
      mode: "ハイブリッド",
      values: ["30,000円", "3,000円", "15,000円"],
    },
    { issue: 505, mode: "ハイブリッド", values: ["0円", "0円", "0円"] },
    {
      issue: 506,
      mode: "ハイブリッド",
      values: ["未設定", "未設定", "未設定"],
    },
  ];
  for (const example of examples) {
    const row = page.getByRole("row").filter({ hasText: `#${example.issue} ` });
    await expect(row.getByRole("cell").nth(3)).toHaveText(example.mode);
    for (const [index, value] of example.values.entries()) {
      await expect(row.getByRole("cell").nth(4 + index)).toHaveText(value);
    }
  }
  await expect(
    page.getByText(/現在のProject設定を表示しています/),
  ).toBeVisible();
  await expect(
    page.getByText(
      /同じIssueの全期間・全作業者の時間報酬の累計上限です（固定報酬は含みません）/,
    ),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const fixedRewardCell = page
    .getByRole("row")
    .filter({ hasText: "#503 " })
    .getByRole("cell")
    .nth(4);
  await fixedRewardCell.scrollIntoViewIfNeeded();
  await expect(fixedRewardCell).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  await page.getByRole("link", { name: "プロフィール", exact: true }).click();
  await expect(page).toHaveURL(/\/workers\/reward-worker$/);
  expect(pageErrors).toEqual([]);
});
