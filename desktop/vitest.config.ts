import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["desktop/src/**/*.test.ts", "desktop/scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "desktop/coverage",
      include: ["desktop/src/**/*.ts"],
      exclude: ["desktop/src/**/*.test.ts"],
    },
  },
})
