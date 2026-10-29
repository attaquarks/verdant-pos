import { defineConfig, devices } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import { APP_ORIGIN, FIXTURE_ORIGIN, FIXTURE_PUBLISHABLE_KEY } from "./tests/e2e/fixture-config";

const bundled = process.platform === "linux";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (bundled ? await chromium.executablePath() : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: APP_ORIGIN,
    actionTimeout: 30000,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath,
      // Single-process serverless defaults crash when Playwright closes/reopens
      // isolated contexts. Keep normal browser security enabled in these tests.
      args: bundled
        ? chromium.args.filter(
            (arg) =>
              ![
                "--single-process",
                "--disable-web-security",
                "--allow-running-insecure-content",
                "--disable-site-isolation-trials",
              ].includes(arg) && !arg.includes("IsolateOrigins"),
          )
        : [],
      headless: true,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --import tsx tests/e2e/fixture-server.ts",
      url: `${FIXTURE_ORIGIN}/__fixture/ready`,
      timeout: 120000,
      reuseExistingServer: false,
      env: { NODE_ENV: "test" },
    },
    {
      command: "npm run build && npm start -- --port 3000",
      url: `${APP_ORIGIN}/login`,
      timeout: 180000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: FIXTURE_ORIGIN,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FIXTURE_PUBLISHABLE_KEY,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        APP_URL: APP_ORIGIN,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
