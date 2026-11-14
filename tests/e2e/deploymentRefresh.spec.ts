import { expect, test } from "@playwright/test";

test("手動の再読み込みで新版を検知したときだけ版固定を解除する", async ({
  page,
}) => {
  let versionChecks = 0;
  await page.route("**/_app/version.json", async (route) => {
    versionChecks += 1;
    await route.fulfill({ json: { version: "e2e-new-deployment" } });
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  expect(versionChecks).toBe(0);
  let cookieClears = 0;
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/deployment-refresh")
      cookieClears += 1;
  });
  const cookieClear = page.waitForResponse("**/api/deployment-refresh");
  await page.reload({ waitUntil: "commit" });
  const response = await cookieClear;
  expect(response.status()).toBe(204);
  expect(await response.headerValue("set-cookie")).toContain(
    "__vdpl=; Max-Age=0; Path=/;",
  );
  await expect.poll(() => versionChecks).toBe(2);
  await page.waitForLoadState("networkidle");
  expect(versionChecks).toBe(2);
  expect(cookieClears).toBe(1);
  await expect(page).toHaveURL("/login");
});
