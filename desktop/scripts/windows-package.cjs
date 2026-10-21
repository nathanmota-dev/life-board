// Native Windows packaging gate; also usable against an installed resourcesDir.
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const asar = require("@electron/asar")

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
  const archive = join(resources, "app.asar")
  const files = asar.listPackage(archive).map(path => path.replaceAll("\\", "/"))
  for (const name of ["/out/main/index.js", "/out/preload/index.js", "/out/renderer/index.html", "/package.json"]) {
    if (!files.includes(name)) throw new Error(`Windows package is missing ${name}.`)
  }
  if (!files.some(path => /\/out\/main\/.*backend-process.*\.js$/.test(path))) throw new Error("Windows package is missing the utilityProcess backend.")
  const metadata = JSON.parse(asar.extractFile(archive, "package.json").toString())
  if (metadata.name !== "life-board-app" || metadata.main !== "./out/main/index.js") throw new Error("Wrong Windows app identity.")
  const main = asar.extractFile(archive, join("out", "main", "index.js")).toString()
  if (!main.includes("dev.nathanmota.lifeboard")) throw new Error("Missing Windows AppUserModelID.")
}

module.exports = { checkPeX64, checkWindowsPackage }
