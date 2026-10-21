import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["desktop/src/**/*.test.ts", "desktop/scripts/**/*.test.ts"],
  },
})
