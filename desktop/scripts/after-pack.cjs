// electron-builder afterPack hook (desktop/electron-builder.yml). npm only installs
// the libSQL binary of the machine running it, so a package built for another OS
// or CPU would ship a backend that can't open the database. This refuses it.
const { existsSync } = require("node:fs")
const { join } = require("node:path")

// Indexed by builder-util's Arch enum.
const ARCHES = ["ia32", "x64", "armv7l", "arm64", "universal"]

// Package names from libsql's optionalDependencies.
const LIBSQL_TARGETS = {
  "linux-x64": "linux-x64-gnu",
  "win32-x64": "win32-x64-msvc",
  "darwin-x64": "darwin-x64",
  "darwin-arm64": "darwin-arm64",
}

/** Throws unless `resourcesDir` has the migrations and the libSQL module for the target. */
function checkPackagedResources(resourcesDir, platform, arch, load = require) {
  const target = LIBSQL_TARGETS[`${platform}-${arch}`]
  if (!target) throw new Error(`Unsupported package target ${platform}-${arch}.`)

  const journal = join(resourcesDir, "migrations", "meta", "_journal.json")
  if (!existsSync(journal)) throw new Error(`Missing database migrations at ${journal}.`)

  // Native modules are unpacked from the ASAR; Electron can't load them from inside it.
  const native = join(resourcesDir, "app.asar.unpacked", "node_modules", "@libsql", target, "index.node")
  if (!existsSync(native)) {
    throw new Error(`Missing @libsql/${target} for ${platform}-${arch}. Package on a matching ${platform} ${arch} machine.`)
  }
  // Only a binary for this machine can be loaded here; others are checked by presence.
  if (platform === process.platform && arch === process.arch && typeof load(native).databaseOpen !== "function") {
    throw new Error(`@libsql/${target} loaded without the libSQL API.`)
  }
  return target
}

async function afterPack(context) {
  const arch = ARCHES[context.arch]
  const target = checkPackagedResources(context.packager.getResourcesDir(context.appOutDir), context.electronPlatformName, arch)
  if (context.electronPlatformName === "win32") require("./windows-package.cjs").checkWindowsPackage(context.appOutDir)
  console.log(`  • checked native module  target=@libsql/${target} platform=${context.electronPlatformName} arch=${arch}`)
}

module.exports = afterPack
module.exports.default = afterPack
module.exports.LIBSQL_TARGETS = LIBSQL_TARGETS
module.exports.checkPackagedResources = checkPackagedResources
