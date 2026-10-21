// Checks the packaged ASAR shared by the Windows and macOS packaging gates.
const { join } = require("node:path")
const asar = require("@electron/asar")

/** Throws unless `resources/app.asar` holds this app's entrypoints and utilityProcess backend. */
function checkAppArchive(resources, label) {
  const archive = join(resources, "app.asar")
  const files = asar.listPackage(archive).map(path => path.replaceAll("\\", "/"))
  for (const name of ["/out/main/index.js", "/out/preload/index.js", "/out/renderer/index.html", "/package.json"]) {
    if (!files.includes(name)) throw new Error(`${label} package is missing ${name}.`)
  }
  if (!files.some(path => /\/out\/main\/.*backend-process.*\.js$/.test(path))) throw new Error(`${label} package is missing the utilityProcess backend.`)
  const metadata = JSON.parse(asar.extractFile(archive, "package.json").toString())
  if (metadata.name !== "life-board-app" || metadata.main !== "./out/main/index.js") throw new Error(`Wrong ${label} app identity.`)
  return asar.extractFile(archive, join("out", "main", "index.js")).toString()
}

module.exports = { checkAppArchive }
