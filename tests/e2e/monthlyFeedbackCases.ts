import { currentJstMonth } from "../../src/lib/month";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { settlementSnapshotV1 } from "../fixtures/settlementSnapshotV1";
import { preferenceQuestions } from "../../src/lib/workerPreferences";
import { feedbackQuestions } from "../../src/lib/monthlyFeedback";
const detail = "/settlements/2026-08/worker";
const privateText = "本人専用の振り返り-秘密の識別文字列";
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
const seedFeedback = async () =>
  withDb(async (sql) => {
    await sql`INSERT INTO monthly_work_submissions (month, assignee_login, snapshot, submitted_by) VALUES ('2026-08', 'worker', ${JSON.stringify(settlementSnapshotV1)}::jsonb, 'worker')`;
    await sql`INSERT INTO monthly_feedback (month, assignee_login, operator_comment, private_reflection) VALUES ('2026-08', 'worker', '運営への質問', ${privateText})`;
  });

export const registerMonthlyFeedbackTests = (): void => {
  test.describe("月次コメントと現在の希望", () => {
    test("再申請でも入力欄は一組だけで、コメントだけ保存してから再申請できる", async ({
      page,
    }) => {
      const month = currentJstMonth();
      await page.goto("/__e2e/login");
      const row = page
        .getByRole("row")
        .filter({ hasText: "#502 E2E: 月次申請と承認を確認する" });
      await row.getByRole("button", { name: "完了報告", exact: true }).click();
      await expect(
        page.getByText(`${month}分として完了報告しました。`),
      ).toBeVisible();
      const url = `/settlements/${month}/tashua314`;
      await page.goto(url);
      await page
        .getByLabel(feedbackQuestions.operatorComment)
        .fill("最初の質問");
      await page
        .getByRole("button", {
          name: "この月の稼働を確定して申請",
          exact: true,
        })
        .click();
      await expect(
        page.getByText(`${month} の稼働を確定して申請しました。`),
      ).toBeVisible();
      await withDb(async (sql) => {
        await sql`INSERT INTO work_sessions (repository, issue_number, issue_title, assignee_login, created_by, started_at, ended_at) VALUES ('techguide-jp/akademy_fes', 502, 'E2E', 'tashua314', 'tashua314', ${month + "-01T03:00:00Z"}, ${month + "-01T04:00:00Z"})`;
      });
      await page.reload();
      await expect(
        page.getByLabel(feedbackQuestions.operatorComment),
      ).toHaveCount(1);
      await expect(
        page.getByLabel(feedbackQuestions.operatorComment),
      ).toHaveValue("最初の質問");
      await page
        .getByLabel(feedbackQuestions.operatorComment)
        .fill("再申請前の質問");
      await page
        .getByRole("button", { name: "コメントを保存", exact: true })
        .click();
      await expect(
        page.getByText("月次コメントを保存しました。"),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "変更内容で再申請", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "変更内容で再申請", exact: true })
        .click();
      await expect(
        page.getByText(`${month} の稼働を確定して申請しました。`),
      ).toBeVisible();
      await expect(
        page.getByLabel(feedbackQuestions.operatorComment),
      ).toHaveCount(1);
      await expect(
        page.getByLabel(feedbackQuestions.operatorComment),
      ).toHaveValue("再申請前の質問");
    });

    test("既存値を引き継ぎ、精算なしで保存した希望が画面間で一致する", async ({
      page,
    }) => {
      await withDb(async (sql) => {
        await sql`INSERT INTO worker_profiles (login, display_name, availability_note, self_assignment_note) VALUES ('worker', '作業者', '既存の平日夜', '既存の開発希望')`;
      });
      await page.goto("/__e2e/login?login=worker");
      await page.goto(detail);
      await expect(
        page.getByLabel(preferenceQuestions.availabilityNote),
      ).toHaveValue("既存の平日夜");
      await expect(
        page.getByLabel(preferenceQuestions.selfAssignmentNote),
      ).toHaveValue("既存の開発希望");
      await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
      await page
        .getByRole("radio", { name: "条件次第で検討したい", exact: true })
        .check();
      await page
        .getByLabel(preferenceQuestions.partnerConditions)
        .fill("リモート中心");
      await page
        .getByRole("button", { name: "希望を保存", exact: true })
        .click();
      await expect(page.getByText("現在の希望を保存しました。")).toBeVisible();
      await page.goto("/workers/worker");
      await expect(
        page.getByLabel(preferenceQuestions.availabilityNote),
      ).toHaveValue("既存の平日夜");
      await expect(
        page.getByLabel(preferenceQuestions.partnerConditions),
      ).toHaveValue("リモート中心");
      await page
        .getByLabel(preferenceQuestions.availabilityNote)
        .fill("週10時間");
      await page
        .getByRole("radio", { name: "現時点では希望しない", exact: true })
        .check();
      await expect(
        page.getByLabel(preferenceQuestions.partnerConditions),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "希望を保存", exact: true })
        .click();
      await expect(page.getByText("現在の希望を保存しました。")).toBeVisible();
      await page.goto(detail);
      await expect(
        page.getByLabel(preferenceQuestions.availabilityNote),
      ).toHaveValue("週10時間");
      await withDb(async (sql) => {
        expect(await sql`SELECT * FROM monthly_work_submissions`).toHaveLength(
          0,
        );
        expect(await sql`SELECT * FROM email_notification_events`).toHaveLength(
          0,
        );
        expect(
          (
            await sql`SELECT partner_conditions FROM worker_profiles WHERE login = 'worker'`
          )[0].partner_conditions,
        ).toBe("");
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });

    test("本人限定本文は管理者HTML・dataにも含まず、他人の直接POSTを拒否する", async ({
      page,
      baseURL,
    }) => {
      await seedFeedback();
      await page.goto("/__e2e/login?login=worker");
      await page.goto(detail);
      await expect(
        page.getByLabel(feedbackQuestions.privateReflection),
      ).toHaveValue(privateText);
      await page
        .getByLabel(feedbackQuestions.operatorComment)
        .fill("追記した質問");
      await page
        .getByRole("button", { name: "コメントを保存", exact: true })
        .click();
      await expect(
        page.getByText("月次コメントを保存しました。"),
      ).toBeVisible();
      await page.goto("/__e2e/login");
      const html = await page.request.get(detail);
      expect(await html.text()).toContain("追記した質問");
      expect(await html.text()).not.toContain(privateText);
      const data = await page.request.get(`${detail}/__data.json`);
      expect(await data.text()).not.toContain(privateText);
      expect(await data.text()).not.toContain("privateReflection");
      await page.goto(detail);
      await expect(
        page.getByText("追記した質問", { exact: true }),
      ).toBeVisible();
      for (const login of ["tashua314", "other-worker"]) {
        await page.goto(`/__e2e/login?login=${login}`);
        for (const action of ["saveFeedback", "savePreferences"]) {
          const response = await page.request.post(`${detail}?/${action}`, {
            headers: { origin: baseURL!, accept: "text/html" },
            maxRedirects: 0,
            form: {
              feedbackVersion: "2",
              operatorComment: "不正な変更",
              privateReflection: "書換",
              preferencesVersion: "0",
              partnerInterest: "interested",
            },
          });
          expect([303, 400]).toContain(response.status());
        }
      }
      await page.goto("/__e2e/login?login=worker");
      await page.goto(detail);
      await expect(
        page.getByLabel(feedbackQuestions.operatorComment),
      ).toHaveValue("追記した質問");
    });

    test("承認後はコメントを固定し、希望だけ更新できる", async ({
      page,
      baseURL,
    }) => {
      await seedFeedback();
      await withDb(async (sql) => {
        await sql`INSERT INTO monthly_settlement_snapshots (month, assignee_login, snapshot, approved_by) VALUES ('2026-08', 'worker', ${JSON.stringify(settlementSnapshotV1)}::jsonb, 'tashua314')`;
      });
      await page.goto("/__e2e/login?login=worker");
      await page.goto(detail);
      await expect(
        page.getByRole("button", { name: "コメントを保存", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByText(privateText, { exact: true })).toBeVisible();
      const denied = await page.request.post(`${detail}?/saveFeedback`, {
        headers: { origin: baseURL!, accept: "text/html" },
        form: {
          feedbackVersion: "1",
          operatorComment: "承認後の変更",
          privateReflection: "",
        },
      });
      expect(denied.status()).toBe(400);
      await page.getByRole("radio", { name: "希望する", exact: true }).check();
      await page
        .getByRole("button", { name: "希望を保存", exact: true })
        .click();
      await expect(page.getByText("現在の希望を保存しました。")).toBeVisible();
      await expect(
        page.getByText("運営への質問", { exact: true }),
      ).toBeVisible();
    });

    test("古い希望フォームを拒否し、入力を保持する", async ({
      page,
      context,
    }) => {
      await page.goto("/__e2e/login?login=worker");
      await page.goto(detail);
      const other = await context.newPage();
      await other.goto("/workers/worker");
      await other.getByRole("radio", { name: "希望する", exact: true }).check();
      await other
        .getByRole("button", { name: "希望を保存", exact: true })
        .click();
      await expect(other.getByText("現在の希望を保存しました。")).toBeVisible();
      await page
        .getByLabel(preferenceQuestions.availabilityNote)
        .fill("消してはいけない入力");
      await page
        .getByRole("radio", { name: "条件次第で検討したい", exact: true })
        .check();
      await page
        .getByRole("button", { name: "希望を保存", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "別の画面で希望が更新されています",
      );
      await expect(
        page.getByLabel(preferenceQuestions.availabilityNote),
      ).toHaveValue("消してはいけない入力");
      await other.close();
    });

    test("JavaScriptなしでも保存失敗時にコメントを保持する", async ({
      browser,
      baseURL,
    }) => {
      await seedFeedback();
      const context = await browser.newContext({
        javaScriptEnabled: false,
        baseURL,
      });
      const page = await context.newPage();
      try {
        await page.goto("/__e2e/login?login=worker");
        await page.goto(detail);
        await page
          .getByLabel(feedbackQuestions.operatorComment)
          .fill("残すべき入力");
        await withDb(async (sql) => {
          await sql`UPDATE monthly_feedback SET version = version + 1`;
        });
        await page
          .getByRole("button", { name: "コメントを保存", exact: true })
          .click();
        await expect(page.getByRole("status")).toContainText(
          "入力内容を控えて再読み込み",
        );
        await expect(
          page.getByLabel(feedbackQuestions.operatorComment),
        ).toHaveValue("残すべき入力");
        await expect(
          page.getByLabel(feedbackQuestions.privateReflection),
        ).toHaveValue(privateText);
      } finally {
        await context.close();
      }
    });
  });
};
