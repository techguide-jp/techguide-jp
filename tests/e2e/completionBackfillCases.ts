import { expect, test } from "@playwright/test";

export const registerCompletionBackfillTests = (): void => {
  test("移行登録はモーダルで検索・絞り込みでき、失敗時は入力を保持し、成功後は候補から外れる", async ({
    page,
  }) => {
    await page.goto("/__e2e/login");
    await page.goto("/settlements/2026-08");
    const trigger = page.getByRole("button", {
      name: "完了報告を移行登録",
      exact: true,
    });
    const dialog = page.getByRole("dialog", {
      name: "完了報告の移行登録",
      exact: true,
    });
    await expect(dialog).not.toBeVisible();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("combobox", { name: "担当者", exact: true })
      .selectOption("reward-worker");
    await expect(dialog.getByRole("radio")).toHaveCount(3);
    await dialog
      .getByRole("combobox", { name: "担当者", exact: true })
      .selectOption("");
    await dialog.getByLabel("キーワード検索").fill("見つからないIssue");
    await expect(
      dialog.getByText("条件に一致するIssueはありません。", { exact: false }),
    ).toBeVisible();
    await dialog.getByLabel("キーワード検索").fill("502 月次");
    await expect(dialog.getByRole("radio")).toHaveCount(1);
    await dialog.getByRole("radio").check();
    await expect(
      dialog.getByRole("link", { name: "Issueを開く" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/techguide-jp/akademy_fes/issues/502",
    );
    await dialog
      .getByLabel("完了日時（JST）", { exact: true })
      .fill("2999-08-20T12:00");
    await dialog
      .getByLabel("証跡URL", { exact: true })
      .fill(
        "https://github.com/techguide-jp/akademy_fes/issues/502#issuecomment-123",
      );
    await dialog
      .getByLabel("登録理由", { exact: true })
      .fill("8月のコメントで納品を連絡済みのため。");
    await dialog
      .getByRole("button", { name: "証跡付きで移行登録", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "未来の完了日時は登録できません。",
    );
    await expect(dialog.getByLabel("登録理由", { exact: true })).toHaveValue(
      "8月のコメントで納品を連絡済みのため。",
    );
    await dialog
      .getByLabel("完了日時（JST）", { exact: true })
      .fill("2026-08-31T23:30");
    await expect(dialog.getByText("固定報酬の精算月：2026年8月")).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(
      dialog.getByText("レビュー依頼や納品・作業完了の連絡を確認できるURL", {
        exact: false,
      }),
    ).toBeVisible();
    await page.screenshot({ path: "/tmp/techguide-backfill-desktop.png" });

    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/settlements/2026-08?*/backfillCompletion",
      async (route) => {
        await released;
        await route.continue();
      },
    );
    await dialog
      .getByRole("button", { name: "証跡付きで移行登録", exact: true })
      .click();
    try {
      await expect(
        dialog.getByRole("button", { name: "登録中...", exact: true }),
      ).toBeDisabled();
      await expect(
        dialog.getByRole("button", { name: "閉じる", exact: true }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
    } finally {
      release();
    }
    await expect(dialog).not.toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "証跡付きの完了報告を移行登録しました。" }),
    ).toBeVisible();
    await trigger.click();
    await expect(dialog.getByRole("radio", { name: /#502/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(trigger).toBeFocused();
  });

  test("狭い画面でも移行登録モーダルを開閉できる", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/__e2e/login");
    await page.goto("/settlements/2026-08");
    const trigger = page.getByRole("button", {
      name: "完了報告を移行登録",
      exact: true,
    });
    const dialog = page.getByRole("dialog", {
      name: "完了報告の移行登録",
      exact: true,
    });
    await trigger.click();
    await expect(dialog.getByLabel("キーワード検索")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "証跡付きで移行登録", exact: true }),
    ).toBeInViewport();
    const box = await dialog.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: "/tmp/techguide-backfill-mobile.png" });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
};
