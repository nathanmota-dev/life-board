import { defineConfig } from "@playwright/test"

// Records the README demo video. It is not part of the E2E suite.
export default defineConfig({
  testDir: "./e2e/demo",
  testMatch: "**/*.record.ts",
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results/demo",
})
