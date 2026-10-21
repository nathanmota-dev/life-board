import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

type Arch = "x64" | "arm64"
const require = createRequire(import.meta.url)
const { checkMachO, checkMacPackage } = require("./macos-package.cjs") as {
  checkMachO: (path: string, arch: string) => void
  checkMacPackage: (appPath: string, arch: string) => void
}
const { createPackage } = require("@electron/asar") as { createPackage: (source: string, destination: string) => Promise<void> }
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function directory() {
  const dir = mkdtempSync(join(tmpdir(), "life-board-macho-"))
  dirs.push(dir)
  return dir
}
const CPU = { x64: 0x01000007, arm64: 0x0100000c }
function macho(cpu: number, magic = 0xfeedfacf) {
  const bytes = Buffer.alloc(32)
  bytes.writeUInt32LE(magic, 0)
  bytes.writeUInt32LE(cpu, 4)
  return bytes
}
const binaries = (arch: Arch) => [
  "Contents/MacOS/Life Board",
  "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework",
  ...["", " (GPU)", " (Plugin)", " (Renderer)"].map(suffix => `Contents/Frameworks/Life Board Helper${suffix}.app/Contents/MacOS/Life Board Helper${suffix}`),
  `Contents/Resources/app.asar.unpacked/node_modules/@libsql/darwin-${arch}/index.node`,
]
async function bundle(arch: Arch, omit?: string) {
  const dir = directory()
  const source = join(dir, "source")
  const files = {
    "package.json": JSON.stringify({ name: "life-board-app", main: "./out/main/index.js" }),
    "out/main/index.js": "main",
    "out/main/chunks/backend-process.js": "backend",
    "out/preload/index.js": "preload",
    "out/renderer/index.html": "renderer",
  }
  for (const [path, contents] of Object.entries(files)) {
    if (path === omit) continue
    mkdirSync(dirname(join(source, path)), { recursive: true })
    writeFileSync(join(source, path), contents)
  }
  const app = join(dir, "Life Board.app")
  for (const path of binaries(arch)) {
    if (path === omit) continue
    mkdirSync(dirname(join(app, path)), { recursive: true })
    writeFileSync(join(app, path), macho(CPU[arch]))
  }
  await createPackage(source, join(app, "Contents/Resources/app.asar"))
  return app
}

describe("macOS packaged bundle inspection", () => {
  it.each<Arch>(["x64", "arm64"])("accepts a thin %s bundle with every helper and the app's entrypoints", async (arch) => {
    const app = await bundle(arch)
    expect(() => checkMacPackage(app, arch)).not.toThrow()
  })
  it("refuses a bundle built for the other architecture", async () => {
    const [arm64, x64] = [await bundle("arm64"), await bundle("x64")]
    expect(() => checkMacPackage(arm64, "x64")).toThrow("macOS x64 Mach-O")
    expect(() => checkMacPackage(x64, "arm64")).toThrow("macOS arm64 Mach-O")
  })
  it.each([
    ["universal (fat)", macho(CPU.x64, 0xbebafeca)],
    ["32-bit", macho(CPU.x64, 0xfeedface)],
    ["truncated", Buffer.alloc(4)],
    ["non Mach-O", Buffer.from("MZ not a mac binary")],
  ])("rejects a %s binary", (_kind, bytes) => {
    const file = join(directory(), "binary")
    writeFileSync(file, bytes)
    expect(() => checkMachO(file, "x64")).toThrow("thin macOS x64")
  })
  it("rejects an Intel libSQL module inside an Apple Silicon bundle", async () => {
    const app = await bundle("arm64")
    writeFileSync(join(app, binaries("arm64").at(-1)!), macho(CPU.x64))
    expect(() => checkMacPackage(app, "arm64")).toThrow(/@libsql[\\/]darwin-arm64/)
  })
  it.each([...binaries("x64"), "out/preload/index.js", "out/main/chunks/backend-process.js"])("rejects a bundle without %s", async (path) => {
    const app = await bundle("x64", path)
    expect(() => checkMacPackage(app, "x64")).toThrow(/ENOENT|missing/)
  })
  it("rejects architectures outside the supported matrix", async () => {
    const app = await bundle("x64")
    expect(() => checkMacPackage(app, "universal")).toThrow("Unsupported macOS architecture")
  })
})
