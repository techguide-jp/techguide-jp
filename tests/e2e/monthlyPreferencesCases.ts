import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { currentJstMonth } from "../../src/lib/month";
import { preferenceQuestions } from "../../src/lib/workerPreferences";
import { feedbackQuestions } from "../../src/lib/monthlyFeedback";
import { assignCompletedIssueMonth } from "./completionMonthCases";

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
const detail = () => `/settlements/${currentJstMonth()}/tashua314`;
const modal = (page: Page) =>
  page.getByRole("dialog", { name: "今後の希望を確認", exact: true });
const prepare = async (page: Page) => {
  await page.goto("/__e2e/login");
  await assignCompletedIssueMonth(page, currentJstMonth());
  await withDb(async (sql) => {
    await sql`INSERT INTO worker_profiles (login, display_name, availability_note, self_assignment_note, partner_interest, partner_conditions) VALUES ('tashua314', '作業者', '平日夜に週5時間', '設計から取り組みたい', 'conditional', 'リモート中心') ON CONFLICT (login) DO UPDATE SET availability_note = excluded.availability_note, self_assignment_note = excluded.self_assignment_note, partner_interest = excluded.partner_interest, partner_conditions = excluded.partner_conditions`;
  });
  await page.goto(detail());
  await page.waitForLoadState("networkidle");
};
const submit = async (page: Page) => {
  await page
    .getByRole("button", { name: "この月の稼働を確定して申請", exact: true })
    .click();
  await expect(modal(page)).toBeVisible();
};

export const registerMonthlyPreferencesTests = (): void => {
  test.describe("申請後の希望確認モーダル", () => {
    test("通常表示から希望を外し、申請後にプロフィールの全項目を引き継いで保存する", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await prepare(page);
      await expect(
        page.getByRole("heading", { name: "現在の希望", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByLabel(preferenceQuestions.availabilityNote),
      ).toHaveCount(0);
      await expect(modal(page)).toHaveCount(0);
      // 詳細表示後に更新されたプロフィールも、申請完了時の再取得で引き継ぐ。
      await withDb(async (sql) => {
        await sql`UPDATE worker_profiles SET availability_note = '最新の週8時間', preferences_version = preferences_version + 1 WHERE login = 'tashua314'`;
      });
      await submit(page);
      const dialog = modal(page);
      await expect(
        dialog.getByLabel(preferenceQuestions.availabilityNote),
      ).toHaveValue("最新の週8時間");
      await expect(
        dialog.getByLabel(preferenceQuestions.selfAssignmentNote),
      ).toHaveValue("設計から取り組みたい");
      await expect(
        dialog.getByRole("radio", {
          name: "条件次第で検討したい",
          exact: true,
        }),
      ).toBeChecked();
      await expect(
        dialog.getByLabel(preferenceQuestions.partnerConditions),
      ).toHaveValue("リモート中心");
      await expect(dialog.getByRole("heading")).toBeFocused();
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        expect(
          await dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
      }
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Shift+Tab");
        expect(
          await dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(box!.height).toBeLessThanOrEqual(844);
      await page.screenshot({
        path: "/private/tmp/techguide-monthly-preferences-mobile.png",
      });
      await dialog
        .getByLabel(preferenceQuestions.availabilityNote)
        .fill("週10時間");
      await dialog
        .getByRole("radio", { name: "現時点では希望しない", exact: true })
        .check();
      await dialog
        .getByRole("button", { name: "変更を保存", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByText("現在の希望を保存しました。", { exact: true }),
      ).toBeVisible();
      await page.goto("/workers/tashua314");
      await expect(
        page.getByLabel(preferenceQuestions.availabilityNote),
      ).toHaveValue("週10時間");
      await expect(
        page.getByLabel(preferenceQuestions.selfAssignmentNote),
      ).toHaveValue("設計から取り組みたい");
      await withDb(async (sql) => {
        const [profile] =
          await sql`SELECT availability_note, partner_conditions, preferences_version FROM worker_profiles WHERE login = 'tashua314'`;
        expect(profile).toMatchObject({
          availability_note: "週10時間",
          partner_conditions: "",
          preferences_version: 2,
        });
        expect(
          await sql`SELECT * FROM monthly_work_submissions WHERE assignee_login = 'tashua314'`,
        ).toHaveLength(1);
      });
      expect(errors).toEqual([]);
    });

    test("変更なしやEscapeで閉じても申請は完了し、希望は更新されず再読込で開かない", async ({
      page,
    }) => {
      await prepare(page);
      await submit(page);
      await modal(page)
        .getByRole("button", { name: "変更なしで閉じる", exact: true })
        .click();
      await expect(modal(page)).toHaveCount(0);
      await page.reload();
      await expect(modal(page)).toHaveCount(0);
      await expect(
        page.getByText("この月の稼働は確定申請済みです。", { exact: false }),
      ).toBeVisible();
      await withDb(async (sql) => {
        await sql`INSERT INTO work_sessions (repository, issue_number, issue_title, assignee_login, created_by, started_at, ended_at) VALUES ('techguide-jp/akademy_fes', 502, 'E2E', 'tashua314', 'tashua314', ${currentJstMonth() + "-01T03:00:00Z"}, ${currentJstMonth() + "-01T04:00:00Z"})`;
      });
      await page.reload();
      await page.waitForLoadState("networkidle");
      await page
        .getByRole("button", { name: "変更内容で再申請", exact: true })
        .click();
      await expect(modal(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(modal(page)).toHaveCount(0);
      await withDb(async (sql) => {
        const [profile] =
          await sql`SELECT availability_note, preferences_version FROM worker_profiles WHERE login = 'tashua314'`;
        expect(profile).toMatchObject({
          availability_note: "平日夜に週5時間",
          preferences_version: 0,
        });
      });
    });

    test("保存競合でもモーダルと入力を保持し、完了済みの申請を巻き戻さない", async ({
      page,
    }) => {
      await prepare(page);
      await submit(page);
      await withDb(async (sql) => {
        await sql`UPDATE worker_profiles SET availability_note = '別画面の最新値', preferences_version = preferences_version + 1 WHERE login = 'tashua314'`;
      });
      const dialog = modal(page);
      await dialog
        .getByLabel(preferenceQuestions.availabilityNote)
        .fill("消してはいけない入力");
      await dialog
        .getByRole("button", { name: "変更を保存", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "別の画面で希望が更新されています",
      );
      await expect(
        dialog.getByLabel(preferenceQuestions.availabilityNote),
      ).toHaveValue("消してはいけない入力");
      await expect(
        dialog.getByRole("button", { name: "変更を保存", exact: true }),
      ).toBeEnabled();
      await withDb(async (sql) => {
        expect(
          await sql`SELECT * FROM monthly_work_submissions WHERE assignee_login = 'tashua314'`,
        ).toHaveLength(1);
        const [profile] =
          await sql`SELECT availability_note FROM worker_profiles WHERE login = 'tashua314'`;
        expect(profile.availability_note).toBe("別画面の最新値");
      });
    });

    test("月次申請に失敗した場合はモーダルを開かない", async ({ page }) => {
      await prepare(page);
      const comment = page.getByLabel(feedbackQuestions.operatorComment);
      await comment.evaluate((element) => element.removeAttribute("maxlength"));
      await comment.fill("あ".repeat(2001));
      await page
        .getByRole("button", {
          name: "この月の稼働を確定して申請",
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toContainText("2,000文字以内");
      await expect(modal(page)).toHaveCount(0);
      await withDb(async (sql) => {
        expect(await sql`SELECT * FROM monthly_work_submissions`).toHaveLength(
          0,
        );
      });
    });

    test("JavaScriptなしでも申請後にプロフィールの希望を確認して保存できる", async ({
      page,
      browser,
      baseURL,
    }) => {
      await prepare(page);
      const context = await browser.newContext({
        javaScriptEnabled: false,
        baseURL,
      });
      try {
        const fallback = await context.newPage();
        await fallback.goto("/__e2e/login");
        await fallback.goto(detail());
        await submit(fallback);
        await expect(
          modal(fallback).getByLabel(preferenceQuestions.availabilityNote),
        ).toHaveValue("平日夜に週5時間");
        await modal(fallback)
          .getByLabel(preferenceQuestions.availabilityNote)
          .fill("JSなしで保存");
        await modal(fallback)
          .getByRole("button", { name: "変更を保存", exact: true })
          .click();
        await expect(modal(fallback)).toHaveCount(0);
        await expect(
          fallback.getByText("現在の希望を保存しました。", { exact: true }),
        ).toBeVisible();
        await fallback.goto("/workers/tashua314");
        await expect(
          fallback.getByLabel(preferenceQuestions.availabilityNote),
        ).toHaveValue("JSなしで保存");
      } finally {
        await context.close();
      }
    });
  });
};
