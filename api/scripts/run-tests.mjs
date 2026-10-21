import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

// libsql 0.5.29 can retain native statement/file handles after client.close().
// Windows cannot unlink those files until the worker exits. Keep test data in
// an owned session and clean it after the entire Vitest process has terminated.
const root = mkdtempSync(join(tmpdir(), "life-board-api-tests-"))
try {
  const cli = join(dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs")
  const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
    stdio: "inherit", env: { ...process.env, LIFE_BOARD_API_TEST_ROOT: root },
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
