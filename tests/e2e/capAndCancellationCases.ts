import { feedbackQuestions } from "../../src/lib/monthlyFeedback";
import { expect, test } from "@playwright/test";

export const registerCapAndCancellationTests = () => {
  test("修正申請の時間を確認して取り消し、上限適用後の精算額を確認する", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/__e2e/login?login=reward-worker");
    await page.waitForLoadState("networkidle");
    const add = async (reason: string) => {
      await page
        .getByRole("row")
        .filter({ hasText: "#504 " })
        .getByRole("button", { name: "追加申請" })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("開始", { exact: true }).fill("2026-09-20T00:00");
      await dialog.getByLabel("終了", { exact: true }).fill("2026-09-20T18:00");
      await dialog.getByLabel("理由").fill(reason);
      await dialog.getByRole("button", { name: "申請", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    };
    await add("取り消す申請");
    const history = page.getByRole("region", { name: "稼働ログの申請履歴" });
    const cancelled = history
      .getByRole("row")
      .filter({ hasText: "取り消す申請" });
    await expect(cancelled).toContainText("18時間00分");
    await cancelled.getByRole("button", { name: "申請を取り消す" }).click();
    await expect(cancelled).toContainText("取り消し済み");
    await expect(cancelled.getByRole("button")).toHaveCount(0);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(cancelled).toContainText("取り消し済み");
    await add("上限を適用する申請");
    await page.goto("/settlements/2026-09/reward-worker?form=submission");
    const monthlyPanel = page.getByRole("region", {
      name: "月次確定申請",
      exact: true,
    });
    await expect(
      monthlyPanel.getByRole("heading", { name: "稼働時刻の管理者の確認待ち" }),
    ).toBeVisible();
    await expect(monthlyPanel).toContainText(
      "すべての確認が終わったら、reward-workerさんがこの画面から月次確定申請してください。",
    );
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "月次確定申請をする", exact: true }),
    ).toHaveCount(0);

    await page.goto("/__e2e/login?login=tashua314");
    await page.goto("/settlements/2026-09");
    await expect(page.getByText("取り消す申請", { exact: true })).toHaveCount(
      0,
    );
    const pending = page
      .getByRole("row")
      .filter({ hasText: "上限を適用する申請" });
    await expect(pending).toContainText("18時間00分");
    const preview = page.getByRole("article", {
      name: "reward-worker #504 上限を適用する申請の見込み",
    });
    await pending.getByRole("link", { name: "承認後の金額を確認" }).click();
    await expect(preview).toContainText("承認後の見込み ￥16,500");
    await expect(preview).toContainText("上限適用前の時間報酬 ￥54,000");
    await page.setViewportSize({ width: 527, height: 863 });
    await expect(preview).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(527);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(
      pending.getByRole("button", { name: "承認", exact: true }),
    ).toBeVisible();
    await expect(preview).toContainText("承認後の見込み ￥16,500");
    await page.setViewportSize({ width: 1280, height: 900 });
    await pending.getByRole("button", { name: "承認", exact: true }).click();
    await expect(pending).toHaveCount(0);
    await expect(preview).toHaveCount(0);
    await expect(
      page.getByText("上限適用後の金額で精算").filter({ visible: true }),
    ).toBeVisible();
    await page.goto("/settlements/2026-09/reward-worker");
    const line = page.getByRole("row").filter({ hasText: "#504 " }).first();
    await expect(page.getByText(/実績計算.*54,000/)).toBeVisible();
    await expect(line).toContainText("15,000");
    await expect(
      page.getByText("上限適用後の金額で精算").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Issue全期間の時間精算額が追加精算上限を超えています。", {
        exact: false,
      }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 527, height: 863 });
    await page
      .getByText("上限適用後の金額で精算")
      .filter({ visible: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText("上限適用後の金額で精算").filter({ visible: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(527);
    await page.goto("/__e2e/login?login=reward-worker");
    await page.goto("/settlements/2026-09/reward-worker");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("textbox")).toHaveCount(0);
    const apply = page.getByRole("link", {
      name: "月次確定申請をする",
      exact: true,
    });
    await apply.click();
    const application = page.getByRole("dialog", {
      name: "月次確定申請",
      exact: true,
    });
    await expect(application).toContainText("申請額（税込） ￥16,500");
    await expect(application.getByRole("heading")).toBeFocused();
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press(key);
        expect(
          await application.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
      }
    }
    const box = await application.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(527);
    expect(box!.height).toBeLessThanOrEqual(863);
    await page.mouse.click(box!.x + 4, box!.y + 4);
    await expect(application).toBeVisible();
    await page.mouse.move(box!.x + 8, box!.y + 8);
    await page.mouse.down();
    await page.mouse.move(4, 4);
    await page.mouse.up();
    await expect(application).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(application).toHaveCount(0);
    await expect(apply).toBeFocused();
    await apply.click();
    await page.keyboard.press("Escape");
    await expect(application).toHaveCount(0);
    await expect(apply).toBeFocused();
    await page.reload();
    await expect(apply).toBeVisible();
    await expect(
      page.getByText("月次確定申請済み・管理者の精算承認待ち"),
    ).toHaveCount(0);
    await apply.click();
    await application
      .getByLabel(feedbackQuestions.operatorComment)
      .fill("確認後に本人から申請");
    await application
      .getByRole("button", { name: "この内容で月次確定申請", exact: true })
      .click();
    await expect(application).toHaveCount(0);
    await page
      .getByRole("button", { name: "変更なしで閉じる", exact: true })
      .click();
    await expect(
      page.getByText("月次確定申請済み・管理者の精算承認待ち"),
    ).toBeVisible();
    await expect(
      page.getByText("確認後に本人から申請", { exact: true }),
    ).toBeVisible();
    await expect(apply).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
};
