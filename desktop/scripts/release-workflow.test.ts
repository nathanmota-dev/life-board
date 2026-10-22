import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { parse } from "yaml"

const workflow = parse(readFileSync(".github/workflows/release.yml", "utf8"))
const step = workflow.jobs.publish.steps.find((entry: { name?: string }) => entry.name === "Verify public downloads and feeds without a token")
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

// Run the actual workflow shell with local downloads, without publishing or using the network.
const commands = `
curl() {
  local url='' output='' arg
  while [ "$#" -gt 0 ]; do
    arg="$1"; shift
    case "$arg" in
      -o) output="$1"; shift ;;
      https://*) url="$arg" ;;
    esac
  done
  local name
  name=$(basename "$url")
  local source="$PUBLIC_SOURCE/$name"
  if [[ "$url" == */latest/download/* ]]; then source="$LATEST_SOURCE"; fi
  if [ -n "$output" ]; then cp "$source" "$output"; else cat "$source"; fi
}
node() {
  test "$1" = desktop/scripts/release-checks.mts
  test "$2" = assets
  test -d "$3"
  test "$4" = linux
  printf '%s' "$3" > "$VALIDATED_DIR"
}
`

describe.skipIf(process.platform !== "linux")("public release workflow verification", () => {
  function run(change?: "asset" | "feed") {
    const root = mkdtempSync(join(tmpdir(), "life-board-workflow-"))
    dirs.push(root)
    const runner = join(root, "runner temp")
    const release = join(root, "release")
    const source = join(root, "downloads")
    mkdirSync(join(root, "public/i18n"), { recursive: true })
    writeFileSync(join(root, "public/i18n/en.json"), '{"app":"Life Board"}')
    mkdirSync(runner)
    mkdirSync(release)
    for (const name of ["latest-linux.yml", "life-board_1.1.0_amd64.deb", "life-board-1.1.0-x86_64.AppImage", "SHA256SUMS.txt"]) {
      writeFileSync(join(release, name), name)
    }
    cpSync(release, source, { recursive: true })
    const latest = join(root, "latest-feed")
    writeFileSync(latest, change === "feed" ? "stale feed" : "latest-linux.yml")
    if (change === "asset") writeFileSync(join(source, "life-board_1.1.0_amd64.deb"), "modified package")
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${commands}\n${step.run}`], {
      cwd: root, encoding: "utf8", timeout: 10000,
      env: { ...process.env, RUNNER_TEMP: runner, GH_REPO: "example/app", TAG: "v1.1.0",
        PUBLIC_SOURCE: source, LATEST_SOURCE: latest, VALIDATED_DIR: join(root, "validated") },
    })
    expect(readFileSync(join(root, "public/i18n/en.json"), "utf8")).toBe('{"app":"Life Board"}')
    expect(readdirSync(runner)).toEqual([])
    return { root, result }
  }

  it("checks downloads in isolation when public/i18n already exists", () => {
    const { root, result } = run()
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(root, "validated"), "utf8")).toContain(join(root, "runner temp/life-board-public."))
  })

  it.each([
    ["asset", "Public assets differ from the verified build"],
    ["feed", "The stable latest-linux.yml does not serve v1.1.0"],
  ] as const)("still fails on an incorrect %s and cleans up temporary downloads", (change, message) => {
    const { result } = run(change)
    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain(message)
  })
})
