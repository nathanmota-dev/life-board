import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MacUpdater } from "electron-updater/out/MacUpdater"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parse } from "yaml"

type AfterPack = {
  LIBSQL_TARGETS: Record<string, string>
  checkPackagedResources: (resourcesDir: string, platform: string, arch: string, load?: (path: string) => unknown) => string
}
const { LIBSQL_TARGETS, checkPackagedResources } = createRequire(import.meta.url)("./after-pack.cjs") as AfterPack

const HOST_TARGET = LIBSQL_TARGETS[`${process.platform}-${process.arch}`]
// Exposes the pinned updater's own (protected) arch filter.
class MacFeed extends MacUpdater {
  static pick(...args: Parameters<typeof MacUpdater["filterFilesForArch"]>) {
    return super.filterFilesForArch(...args)
  }
}

const config = parse(readFileSync("desktop/electron-builder.yml", "utf8"))
const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }

describe("afterPack native module check", () => {
  let resources: string

  const addModule = (target: string) => {
    const dir = join(resources, "app.asar.unpacked/node_modules/@libsql", target)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "index.node"), "")
  }

  beforeEach(() => {
    resources = mkdtempSync(join(tmpdir(), "life-board-pack-"))
    mkdirSync(join(resources, "migrations/meta"), { recursive: true })
    writeFileSync(join(resources, "migrations/meta/_journal.json"), "{}")
  })
  afterEach(() => rmSync(resources, { recursive: true, force: true }))

  it("refuses a Windows package that only has the Linux binary", () => {
    addModule("linux-x64-gnu")
    expect(() => checkPackagedResources(resources, "win32", "x64")).toThrow("Missing @libsql/win32-x64-msvc for win32-x64")
  })

  it("refuses an Intel Mac package built with the Apple Silicon binary", () => {
    addModule("darwin-arm64")
    expect(() => checkPackagedResources(resources, "darwin", "x64")).toThrow("Missing @libsql/darwin-x64")
  })

  it("refuses a package without migrations", () => {
    addModule("darwin-arm64")
    rmSync(join(resources, "migrations"), { recursive: true })
    expect(() => checkPackagedResources(resources, "darwin", "arm64")).toThrow("Missing database migrations")
  })

  it("refuses targets outside the supported matrix", () => {
    expect(() => checkPackagedResources(resources, "linux", "arm64")).toThrow("Unsupported package target linux-arm64")
  })

  it.each([
    ["linux", "x64", "linux-x64-gnu"],
    ["win32", "x64", "win32-x64-msvc"],
    ["darwin", "x64", "darwin-x64"],
    ["darwin", "arm64", "darwin-arm64"],
  ])("accepts %s %s with @libsql/%s and loads it only on a matching machine", (platform, arch, target) => {
    addModule(target)
    const load = vi.fn(() => ({ databaseOpen: () => {} }))
    expect(checkPackagedResources(resources, platform, arch, load)).toBe(target)
    expect(load).toHaveBeenCalledTimes(platform === process.platform && arch === process.arch ? 1 : 0)
  })

  describe.runIf(HOST_TARGET)("on this machine", () => {
    it("loads the real libSQL binary", () => {
      const dir = join(resources, "app.asar.unpacked/node_modules/@libsql", HOST_TARGET!)
      mkdirSync(dir, { recursive: true })
      copyFileSync(join("node_modules/@libsql", HOST_TARGET!, "index.node"), join(dir, "index.node"))
      // Windows keeps a loaded .node DLL locked until the process exits. Load
      // the real copied binary in a child so teardown can remove its directory.
      const output = execFileSync(process.execPath, ["-e",
        'console.log(require(process.argv[1]).checkPackagedResources(process.argv[2], process.platform, process.arch))',
        join(process.cwd(), "desktop/scripts/after-pack.cjs"), resources], { encoding: "utf8" })
      expect(output.trim()).toBe(HOST_TARGET)
    })

    it("refuses a binary that loads without the libSQL API", () => {
      addModule(HOST_TARGET!)
      expect(() => checkPackagedResources(resources, process.platform, process.arch, () => ({}))).toThrow("without the libSQL API")
    })
  })
})

describe("package contract", () => {
  const name = (template: string, arch: string, ext: string) =>
    template.replace("${version}", "1.1.0").replace("${arch}", arch).replace("${ext}", ext)

  it("keeps the Linux identity and file names of 1.0.0", () => {
    expect(config.appId).toBe("dev.nathanmota.lifeboard")
    expect(config.productName).toBe("Life Board")
    expect(name(config.linux.artifactName, "x86_64", "AppImage")).toBe("life-board-1.1.0-x86_64.AppImage")
    expect(name(config.deb.artifactName, "amd64", "deb")).toBe("life-board_1.1.0_amd64.deb")
    expect(config.deb.packageName).toBe("life-board")
    expect(scripts["package:linux"]).toContain("--linux AppImage deb --x64 --publish never")
  })

  it.each([
    ["package:win", "--win nsis --x64 --publish never"],
    ["package:mac:x64", "--mac dmg zip --x64 --publish never -c.directories.output=release/mac-x64"],
    ["package:mac:arm64", "--mac dmg zip --arm64 --publish never -c.directories.output=release/mac-arm64"],
  ])("%s builds first and never publishes", (script, flags) => {
    expect(scripts[script]).toBe(`npm run build && electron-builder --config desktop/electron-builder.yml ${flags}`)
  })

  it("names every installer with its OS and architecture", () => {
    expect(config.mac.target).toEqual(["dmg", "zip"])
    const names = [
      name(config.nsis.artifactName, "x64", "exe"),
      ...["x64", "arm64"].flatMap((arch) => [name(config.mac.artifactName, arch, "zip"), name(config.dmg.artifactName, arch, "dmg")]),
    ]
    expect(names).toEqual([
      "life-board-1.1.0-win-x64.exe",
      "life-board-1.1.0-mac-x64.zip",
      "life-board-1.1.0-mac-x64.dmg",
      "life-board-1.1.0-mac-arm64.zip",
      "life-board-1.1.0-mac-arm64.dmg",
    ])
  })

  it("signs Mac builds with the hardened runtime and only the JIT exception", () => {
    const keys = (file: string) => [...readFileSync(file, "utf8").matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1])
    expect(config.mac).toMatchObject({
      hardenedRuntime: true,
      entitlements: "desktop/resources/entitlements.mac.plist",
      entitlementsInherit: "desktop/resources/entitlements.mac.plist",
    })
    expect(keys(config.mac.entitlements)).toEqual(["com.apple.security.cs.allow-jit"])
    // Ad-hoc code has no Team ID, so only build-only packages relax library validation.
    expect(keys("desktop/resources/entitlements.mac.adhoc.plist")).toEqual(["com.apple.security.cs.allow-jit", "com.apple.security.cs.disable-library-validation"])
    expect(config.mac.identity).toBeUndefined()
    expect(config.dmg.writeUpdateInfo).toBe(false)
  })

  // Both Mac builds write latest-mac.yml; the release publishes one with both ZIPs.
  it.each([[false, "life-board-1.1.0-mac-x64.zip"], [true, "life-board-1.1.0-mac-arm64.zip"]])(
    "lets the Mac updater pick its ZIP from the combined feed (arm64 Mac: %s)",
    (isArm64Mac, expected) => {
      const files = ["x64", "arm64"].map((arch) => {
        const url = name(config.mac.artifactName, arch, "zip")
        return { url: new URL(`https://github.com/nathanmota-dev/life-board/releases/download/v1.1.0/${url}`), info: { url, sha512: "", size: 0 } }
      })
      expect(MacFeed.pick(files, isArm64Mac).map((file) => file.info.url)).toEqual([expected])
    },
  )
})
