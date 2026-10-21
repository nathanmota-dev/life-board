// Native macOS packaging gate; also usable against an installed .app bundle.
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const { checkAppArchive } = require("./app-archive.cjs")

// Thin 64-bit Mach-O CPU types; universal (fat) binaries are out of scope.
const CPU_TYPES = { x64: 0x01000007, arm64: 0x0100000c }
const HELPERS = ["", " (GPU)", " (Plugin)", " (Renderer)"]

function checkMachO(path, arch) {
  const bytes = readFileSync(path)
  if (bytes.length < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== CPU_TYPES[arch]) {
    throw new Error(`Expected a thin macOS ${arch} Mach-O binary: ${path}`)
  }
}

function checkMacPackage(appPath, arch, name = "Life Board") {
  if (!CPU_TYPES[arch]) throw new Error(`Unsupported macOS architecture ${arch}.`)
  const contents = join(appPath, "Contents")
  checkMachO(join(contents, "MacOS", name), arch)
  checkMachO(join(contents, "Frameworks/Electron Framework.framework/Versions/A/Electron Framework"), arch)
  // The utilityProcess backend runs in the plain helper; renderers and GPU in their own.
  for (const suffix of HELPERS) {
    const helper = `${name} Helper${suffix}`
    checkMachO(join(contents, "Frameworks", `${helper}.app`, "Contents/MacOS", helper), arch)
  }
  const resources = join(contents, "Resources")
  checkMachO(join(resources, `app.asar.unpacked/node_modules/@libsql/darwin-${arch}/index.node`), arch)
  checkAppArchive(resources, "macOS")
}

module.exports = { checkMachO, checkMacPackage }
