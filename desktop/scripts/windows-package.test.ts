import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const { checkPeX64, checkWindowsPackage } = require("./windows-package.cjs") as { checkPeX64: (path: string) => void, checkWindowsPackage: (path: string) => void }
const { createPackage } = require("@electron/asar") as { createPackage: (source: string, destination: string) => Promise<void> }
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function directory() {
  const dir = mkdtempSync(join(tmpdir(), "life-board-pe-"))
  dirs.push(dir)
  return dir
}
function pe(machine = 0x8664) {
  const bytes = Buffer.alloc(128)
  bytes.write("MZ")
  bytes.writeUInt32LE(64, 60)
  bytes.writeUInt32LE(0x4550, 64)
  bytes.writeUInt16LE(machine, 68)
  return bytes
}
async function packaged(omit?: string, identity = "life-board-app") {
  const dir = directory()
  const source = join(dir, "source")
  const files = {
    "package.json": JSON.stringify({ name: identity, main: "./out/main/index.js" }),
    "out/main/index.js": 'app.setAppUserModelId("dev.nathanmota.lifeboard")',
    "out/main/chunks/backend-process.js": "backend",
    "out/preload/index.js": "preload",
    "out/renderer/index.html": "renderer",
  }
  for (const [path, contents] of Object.entries(files)) {
    if (path === omit) continue
    mkdirSync(dirname(join(source, path)), { recursive: true })
    writeFileSync(join(source, path), contents)
  }
  const native = join(dir, "resources/app.asar.unpacked/node_modules/@libsql/win32-x64-msvc/index.node")
  mkdirSync(dirname(native), { recursive: true })
  writeFileSync(native, pe())
  writeFileSync(join(dir, "Life Board.exe"), pe())
  await createPackage(source, join(dir, "resources/app.asar"))
  return dir
}

describe("Windows packaged resource inspection", () => {
  it("accepts x64 executables and a real ASAR with the app's entrypoints", async () => {
    const dir = await packaged()
    expect(() => checkWindowsPackage(dir)).not.toThrow()
  })
  it.each([0x14c, 0xaa64])("rejects PE machine %s", (machine) => {
    const file = join(directory(), "app.exe")
    writeFileSync(file, pe(machine))
    expect(() => checkPeX64(file)).toThrow("Windows x64 PE")
  })
  it.each([Buffer.alloc(0), Buffer.from("not PE"), Buffer.alloc(64, 255)])("rejects truncated or invalid executable headers", bytes => {
    const file = join(directory(), "app.exe")
    writeFileSync(file, bytes)
    expect(() => checkPeX64(file)).toThrow("Windows x64 PE")
  })
  it.each(["out/preload/index.js", "out/renderer/index.html", "out/main/chunks/backend-process.js"])("rejects a package without %s", async path => {
    const dir = await packaged(path)
    expect(() => checkWindowsPackage(dir)).toThrow(/missing/)
  })
  it("rejects another app identity and a wrong native module architecture", async () => {
    const wrongIdentity = await packaged(undefined, "other-app")
    expect(() => checkWindowsPackage(wrongIdentity)).toThrow("identity")
    const dir = await packaged()
    const native = join(dir, "resources/app.asar.unpacked/node_modules/@libsql/win32-x64-msvc/index.node")
    const bytes = readFileSync(native)
    bytes.writeUInt16LE(0xaa64, 68)
    writeFileSync(native, bytes)
    expect(() => checkWindowsPackage(dir)).toThrow("Windows x64 PE")
  })
})
