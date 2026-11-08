import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MacUpdater } from "electron-updater/out/MacUpdater"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { parse } from "yaml"

type AfterPack = {
  BACKEND_TARGETS: Record<string, string>
  checkPackagedResources: (resourcesDir: string, platform: string, arch: string) => string
}
const { BACKEND_TARGETS, checkPackagedResources } = createRequire(import.meta.url)("./after-pack.cjs") as AfterPack

// Exposes the pinned updater's own (protected) arch filter.
class MacFeed extends MacUpdater {
  static pick(...args: Parameters<typeof MacUpdater["filterFilesForArch"]>) {
    return super.filterFilesForArch(...args)
  }
}

const config = parse(readFileSync("desktop/electron-builder.yml", "utf8"))
const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }

function elf(machine = 0x3e) {
  const bytes = Buffer.alloc(64)
  bytes.write("\x7fELF", 0, "latin1")
  bytes[4] = 2
  bytes.writeUInt16LE(machine, 18)
  return bytes
}
function pe(machine = 0x8664) {
  const bytes = Buffer.alloc(96)
  bytes.write("MZ", 0, "latin1")
  bytes.writeUInt32LE(64, 60)
  bytes.writeUInt32LE(0x4550, 64)
  bytes.writeUInt16LE(machine, 68)
  return bytes
}
function macho(cpu: number) {
  const bytes = Buffer.alloc(32)
  bytes.writeUInt32LE(0xfeedfacf, 0)
  bytes.writeUInt32LE(cpu, 4)
  return bytes
}

describe("afterPack API binary check", () => {
  let resources: string

  const addBinary = (name: string, bytes: Buffer, mode = 0o755) => {
    mkdirSync(join(resources, "bin"), { recursive: true })
    writeFileSync(join(resources, "bin", name), bytes, { mode })
  }

  beforeEach(() => { resources = mkdtempSync(join(tmpdir(), "life-board-pack-")) })
  afterEach(() => rmSync(resources, { recursive: true, force: true }))

  it("refuses a package without the binary", () => {
    expect(() => checkPackagedResources(resources, "linux", "x64")).toThrow("Missing API binary")
  })

  it("refuses a Windows package that only has the Linux binary", () => {
    addBinary("life-board-api.exe", elf())
    expect(() => checkPackagedResources(resources, "win32", "x64")).toThrow("doesn't match win32-x64")
  })

  it("refuses an Intel Mac package built with the Apple Silicon binary", () => {
    addBinary("life-board-api", macho(0x0100000c))
    expect(() => checkPackagedResources(resources, "darwin", "x64")).toThrow("doesn't match darwin-x64")
  })

  it("refuses a Linux binary for another CPU", () => {
    addBinary("life-board-api", elf(0xb7))
    expect(() => checkPackagedResources(resources, "linux", "x64")).toThrow("doesn't match linux-x64")
  })

  it.skipIf(process.platform === "win32")("refuses a binary without the execute bit", () => {
    addBinary("life-board-api", elf(), 0o644)
    expect(() => checkPackagedResources(resources, "linux", "x64")).toThrow("not executable")
  })

  it("refuses targets outside the supported matrix", () => {
    expect(() => checkPackagedResources(resources, "linux", "arm64")).toThrow("Unsupported package target linux-arm64")
  })

  it.each([
    ["linux", "x64", elf()],
    ["win32", "x64", pe()],
    ["darwin", "x64", macho(0x01000007)],
    ["darwin", "arm64", macho(0x0100000c)],
  ] as const)("accepts %s %s", (platform, arch, bytes) => {
    addBinary(BACKEND_TARGETS[`${platform}-${arch}`], bytes)
    expect(checkPackagedResources(resources, platform, arch)).toBe(`${platform}-${arch}`)
  })

  it("ships the release binary and no migrations folder", () => {
    expect(config.extraResources).toEqual([{ from: "target/release", to: "bin", filter: ["life-board-api", "life-board-api.exe"] }])
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
    expect(scripts[script]).toBe(`cargo build -p life-board-api --release --locked && npm run build:app && electron-builder --config desktop/electron-builder.yml ${flags}`)
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
