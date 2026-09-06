import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { settlementSnapshotV1 } from "../fixtures/settlementSnapshotV1";

const detailUrl = "/settlements/2026-08/worker";
const comment = '振込名義: テックガイド\n<img src=x onerror="alert(1)">';

// workflow.spec.ts と同じファイルのテストとして登録し、共有DBのreset競合を避ける。
export const registerPaymentCommentTests = (): void => {
  test.describe("支払いコメント", () => {
    test.beforeEach(async () => {
      if (!process.env.DATABASE_URL) throw new Error("テストDBが必要です。");
      const sql = postgres(process.env.DATABASE_URL);
      try {
        await sql`
          INSERT INTO monthly_settlement_snapshots (
            month, assignee_login, snapshot, approved_by, approved_at
          ) VALUES (
            '2026-08', 'worker', ${JSON.stringify(settlementSnapshotV1)}::jsonb,
            'tashua314', '2026-09-03T00:00:00Z'
          )
        `;
      } finally {
        await sql.end();
      }
    });

    test("管理者の登録内容を本人だけに表示し、取消・再登録できる", async ({
      page,
      baseURL,
    }) => {
      await page.goto("/__e2e/login");
      await page.goto(detailUrl);
      await page.getByLabel("支払日", { exact: true }).fill("2026-09-14");
      await page.getByLabel("作業者へのコメント（任意）").fill(comment);
      await page.getByRole("button", { name: "支払い済みにする" }).click();
      await expect(
        page.getByText("支払い済みとして登録しました。"),
      ).toBeVisible();
      await expect(page.locator(".payment-comment")).toHaveText(comment);
      await expect(page.locator(".payment-comment img")).toHaveCount(0);

      await page.getByLabel("予定日", { exact: true }).fill("2026-09-20");
      await page.getByRole("button", { name: "予定日を保存" }).click();
      await expect(
        page.getByText("支払い予定日を更新しました。"),
      ).toBeVisible();
      await page.reload();
      await expect(page.locator(".payment-comment")).toHaveText(comment);

      await page.goto("/__e2e/login?login=worker");
      await page.goto(detailUrl);
      await expect(page.locator(".payment-comment")).toHaveText(comment);
      await expect(page.getByLabel("作業者へのコメント（任意）")).toHaveCount(
        0,
      );
      for (const action of ["markPaid", "revertPayment"]) {
        const denied = await page.request.post(`${detailUrl}?/${action}`, {
          headers: { origin: baseURL!, accept: "text/html" },
          form: { paidOn: "2026-09-15", paymentComment: "不正な変更" },
          maxRedirects: 0,
        });
        expect(denied.status()).toBe(303);
        expect(denied.headers().location).toBe("/work");
      }
      await page.reload();
      await expect(page.locator(".payment-comment")).toHaveText(comment);

      await page.goto("/__e2e/login?login=other-worker");
      const denied = await page.request.get(detailUrl, { maxRedirects: 0 });
      expect(denied.status()).toBe(303);
      expect(await denied.text()).not.toContain("振込名義");
      await page.goto(detailUrl);
      await expect(page).toHaveURL(/\/work$/);

      await page.goto("/__e2e/login");
      await page.goto(detailUrl);
      await page
        .getByRole("button", { name: "未処理に戻す", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "支払日と作業者へのコメントは削除されます",
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "未処理に戻す", exact: true })
        .click();
      await expect(page.locator(".payment-comment")).toHaveCount(0);
      await expect(page.getByLabel("作業者へのコメント（任意）")).toHaveValue(
        "",
      );

      await page.goto("/__e2e/login?login=worker");
      await page.goto(detailUrl);
      await expect(page.locator(".payment-comment")).toHaveCount(0);
      await expect(
        page.locator("dt").filter({ hasText: /^支払日$/ }),
      ).toHaveCount(0);

      await page.goto("/__e2e/login");
      await page.goto(detailUrl);
      await page.getByLabel("支払日", { exact: true }).fill("2026-09-21");
      await page
        .getByLabel("作業者へのコメント（任意）")
        .fill("新しいコメント");
      await page.getByRole("button", { name: "支払い済みにする" }).click();
      await expect(page.locator(".payment-comment")).toHaveText(
        "新しいコメント",
      );
      await page.goto("/__e2e/login?login=worker");
      await page.goto(detailUrl);
      await expect(page.locator(".payment-comment")).toHaveText(
        "新しいコメント",
      );
    });

    for (const input of ["", " \n "]) {
      test(`空欄・空白のみではコメント項目を表示しない: ${JSON.stringify(input)}`, async ({
        page,
      }) => {
        await page.goto("/__e2e/login");
        await page.goto(detailUrl);
        await page.getByLabel("作業者へのコメント（任意）").fill(input);
        await page.getByRole("button", { name: "支払い済みにする" }).click();
        await expect(
          page.getByText("支払い済みとして登録しました。"),
        ).toBeVisible();
        await expect(page.locator(".payment-comment")).toHaveCount(0);
        await page.goto("/__e2e/login?login=worker");
        await page.goto(detailUrl);
        await expect(page.locator(".payment-comment")).toHaveCount(0);
        await expect(
          page.locator("dt").filter({ hasText: /^作業者へのコメント$/ }),
        ).toHaveCount(0);
      });
    }

    test("上限超過をサーバーで拒否し、入力を保持して再送できる", async ({
      page,
    }) => {
      await page.goto("/__e2e/login");
      await page.goto(detailUrl);
      const textarea = page.getByLabel("作業者へのコメント（任意）");
      await expect(textarea).toHaveAttribute("maxlength", "2000");
      await textarea.evaluate((element) =>
        element.removeAttribute("maxlength"),
      );
      await textarea.evaluate((element) => {
        (element as HTMLTextAreaElement).form!.noValidate = true;
      });
      await textarea.fill("あ".repeat(2001));
      await page.getByLabel("支払日", { exact: true }).fill("2026-09-16");
      await page.getByRole("button", { name: "支払い済みにする" }).click();
      await expect(
        page.getByText("作業者へのコメントは2,000文字以内で入力してください。"),
      ).toBeVisible();
      await expect(textarea).toHaveValue("あ".repeat(2001));
      await expect(page.getByLabel("支払日", { exact: true })).toHaveValue(
        "2026-09-16",
      );
      await expect(
        page.getByRole("button", { name: "支払い済みにする" }),
      ).toBeEnabled();
      await textarea.fill("あ".repeat(2000));
      await page.getByRole("button", { name: "支払い済みにする" }).click();
      await expect(page.locator(".payment-comment")).toHaveText(
        "あ".repeat(2000),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator(".payment-comment")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });

    test("JavaScriptなしでもエラー時に支払日とコメントを保持する", async ({
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        baseURL,
      });
      try {
        const page = await context.newPage();
        await page.goto("/__e2e/login");
        await page.goto(detailUrl);
        await page.getByLabel("支払日", { exact: true }).fill("2026-09-16");
        // ブラウザー側の制限を外し、JavaScriptなしの通常POSTでもサーバー検証を確認する。
        await page
          .getByLabel("作業者へのコメント（任意）")
          .evaluate((element) => element.removeAttribute("maxlength"));
        await page
          .getByLabel("作業者へのコメント（任意）")
          .fill("あ".repeat(2001));
        await page.getByRole("button", { name: "支払い済みにする" }).click();
        await expect(
          page.getByText(
            "作業者へのコメントは2,000文字以内で入力してください。",
          ),
        ).toBeVisible();
        await expect(page.getByLabel("支払日", { exact: true })).toHaveValue(
          "2026-09-16",
        );
        await expect(page.getByLabel("作業者へのコメント（任意）")).toHaveValue(
          "あ".repeat(2001),
        );
      } finally {
        await context.close();
      }
    });
  });
};
