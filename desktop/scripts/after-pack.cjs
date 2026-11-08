// electron-builder afterPack hook (desktop/electron-builder.yml). Cargo only builds
// the API for the machine running it, so a package built for another OS or CPU
// would ship a backend that can't start. This refuses it.
const { constants, accessSync, existsSync, readFileSync, statSync } = require("node:fs")
const { join } = require("node:path")

// Indexed by builder-util's Arch enum.
const ARCHES = ["ia32", "x64", "armv7l", "arm64", "universal"]

const ELF_X86_64 = 0x3e
const PE_X64 = 0x8664
const MACH_O_CPU = { x64: 0x01000007, arm64: 0x0100000c }

function isTargetBinary(path, platform, arch) {
  const bytes = readFileSync(path)
  if (platform === "linux") return bytes.length >= 20 && bytes.toString("latin1", 0, 4) === "\x7fELF" && bytes[4] === 2 && bytes.readUInt16LE(18) === ELF_X86_64
  if (platform === "win32") {
    const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : -1
    return bytes.toString("latin1", 0, 2) === "MZ" && offset >= 64 && offset + 6 <= bytes.length
      && bytes.readUInt32LE(offset) === 0x4550 && bytes.readUInt16LE(offset + 4) === PE_X64
  }
  return bytes.length >= 8 && bytes.readUInt32LE(0) === 0xfeedfacf && bytes.readUInt32LE(4) === MACH_O_CPU[arch]
}

const BACKEND_TARGETS = { "linux-x64": "life-board-api", "win32-x64": "life-board-api.exe", "darwin-x64": "life-board-api", "darwin-arm64": "life-board-api" }

/** Throws unless `resourcesDir` has an executable API binary for the target. */
function checkPackagedResources(resourcesDir, platform, arch) {
  const name = BACKEND_TARGETS[`${platform}-${arch}`]
  if (!name) throw new Error(`Unsupported package target ${platform}-${arch}.`)

  const binary = join(resourcesDir, "bin", name)
  if (!existsSync(binary)) throw new Error(`Missing API binary at ${binary}. Run cargo build --release first.`)
  if (!statSync(binary).isFile()) throw new Error(`The API binary at ${binary} is not a file.`)
  // Windows has no execute bit; a package from there can't be checked for one.
  if (platform !== "win32" && process.platform !== "win32") {
    try {
      accessSync(binary, constants.X_OK)
    } catch {
      throw new Error(`The API binary at ${binary} is not executable.`)
    }
  }
  if (!isTargetBinary(binary, platform, arch)) {
    throw new Error(`The API binary doesn't match ${platform}-${arch}. Package on a matching ${platform} ${arch} machine.`)
  }
  return `${platform}-${arch}`
}

async function afterPack(context) {
  const arch = ARCHES[context.arch]
  const target = checkPackagedResources(context.packager.getResourcesDir(context.appOutDir), context.electronPlatformName, arch)
  if (context.electronPlatformName === "win32") require("./windows-package.cjs").checkWindowsPackage(context.appOutDir)
  if (context.electronPlatformName === "darwin") {
    const name = context.packager.appInfo.productFilename
    require("./macos-package.cjs").checkMacPackage(join(context.appOutDir, `${name}.app`), arch, name)
  }
  console.log(`  • checked API binary  target=${target}`)
}

module.exports = afterPack
module.exports.default = afterPack
module.exports.BACKEND_TARGETS = BACKEND_TARGETS
module.exports.checkPackagedResources = checkPackagedResources
