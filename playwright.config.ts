import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";

process.env.E2E_TEST_MODE ??= "1";
process.env.PUBLIC_APP_ORIGIN ??= baseURL;
process.env.ADMIN_GITHUB_LOGINS ??= "tashua314";
process.env.SESSION_SECRET ??= "e2e-session-secret";
process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY ??=
  "ZGV2ZWxvcG1lbnQtcGF5b3V0LWFjY291bnQta2V5LTMyYiE=";
process.env.GITHUB_CLIENT_ID ??= "e2e-client-id";
process.env.GITHUB_CLIENT_SECRET ??= "e2e-client-secret";
process.env.GITHUB_PROJECT_TOKEN ??= "e2e-project-token";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 4173",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
