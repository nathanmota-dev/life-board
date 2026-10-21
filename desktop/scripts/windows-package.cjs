// Native Windows packaging gate; also usable against an installed resourcesDir.
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const { checkAppArchive } = require("./app-archive.cjs")

function checkPeX64(path) {
  const bytes = readFileSync(path)
  const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : -1
  if (bytes.toString("ascii", 0, 2) !== "MZ" || offset < 64 || offset + 6 > bytes.length
    || bytes.readUInt32LE(offset) !== 0x4550 || bytes.readUInt16LE(offset + 4) !== 0x8664) {
    throw new Error(`Expected a Windows x64 PE binary: ${path}`)
  }
}

function checkWindowsPackage(appDir) {
  checkPeX64(join(appDir, "Life Board.exe"))
  const resources = join(appDir, "resources")
  checkPeX64(join(resources, "app.asar.unpacked/node_modules/@libsql/win32-x64-msvc/index.node"))
  const main = checkAppArchive(resources, "Windows")
  if (!main.includes("dev.nathanmota.lifeboard")) throw new Error("Missing Windows AppUserModelID.")
}

module.exports = { checkPeX64, checkWindowsPackage }
