import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";
const bundled = process.platform === "linux";
export default defineConfig({
  testDir: "./tests/cloud",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 900000,
  reporter: [["list"]],
  outputDir: "artifacts/cloud/playwright",
  use: {
    baseURL: "https://verdant-pos-tau.vercel.app",
    trace: "off", // Real credentials/session cookies must never enter a trace.
    screenshot: "off",
    video: "off",
    actionTimeout: 20000,
    reducedMotion: "reduce",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (bundled ? await chromium.executablePath() : undefined),
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
});
