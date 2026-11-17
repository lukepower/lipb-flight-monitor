import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = 43147;
const baseURL = `http://127.0.0.1:${port}`;
const rootDir = __dirname;
const standaloneDir = path.resolve(rootDir, ".next/standalone");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // `output: "standalone"` — `next start` is unsupported; run server.js from the
    // prepared standalone folder (CI already ran `npm run build`).
    command: process.env.CI
      ? "node server.js"
      : "npm run build && node .next/standalone/server.js",
    cwd: process.env.CI ? standaloneDir : rootDir,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      HISTORY_DIR: path.resolve(rootDir, "e2e/fixtures/empty-history"),
    },
  },
});
