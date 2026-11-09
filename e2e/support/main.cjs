const { readFileSync, appendFileSync } = require("node:fs")
const { basename, join } = require("node:path")
const { EventEmitter } = require("node:events")
const electron = require("electron")
const { app, Tray, globalShortcut, shell } = electron
const root = process.env.LIFE_BOARD_E2E_ROOT
const scenario = JSON.parse(readFileSync(process.env.LIFE_BOARD_E2E_SCENARIO, "utf8"))
// Playwright's Electron loader appends password-store=basic after CLI arguments.
// Restore libsecret before ready so the production key handling is exercised.
app.commandLine.removeSwitch("password-store")
app.commandLine.appendSwitch("password-store", "gnome-libsecret")
app.commandLine.removeSwitch("use-mock-keychain")
app.setAppPath(root)
app.setPath("userData", join(process.env.LIFE_BOARD_E2E_HOME, "electron"))
require("./clock.cjs")()
const state = globalThis.e2e = { external: [], notifications: [], shortcuts: {}, menu: null, relaunch: [] }
electron.dialog.showErrorBox = (title, message) => { console.error(`${title}: ${message}`); app.exit(1) }
const record = value => appendFileSync(process.env.LIFE_BOARD_E2E_CALLS, JSON.stringify(value) + "\n")
shell.openExternal = async url => { state.external.push(url); record({ kind: "external", url }) }
const register = globalShortcut.register.bind(globalShortcut)
globalShortcut.register = (accelerator, callback) => {
  const registered = register(accelerator, callback)
  if (registered) state.shortcuts[accelerator] = callback
  return registered
}
const setContextMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (menu) { state.menu = menu; return setContextMenu.call(this, menu) }
class SyntheticNotification extends EventEmitter {
  static isSupported() { return true }
  constructor(options) { super(); this.options = options; state.notifications.push(this) }
  show() { record({ kind: "notification", ...this.options }) }
  close() { this.emit("close") }
}
const Module = require("node:module")
const load = Module._load
const native = new Proxy(electron, { get: (target, key) => key === "Notification" ? SyntheticNotification : Reflect.get(target, key) })
Module._load = function (id, ...args) { return id === "electron" ? native : load.call(this, id, ...args) }
// The sidecar built with the `e2e` feature follows the test clock and talks to
// the synthetic GitHub below; the feature never reaches a packaged binary.
const childProcess = require("node:child_process")
const spawn = childProcess.spawn
let githubUrl
childProcess.spawn = (file, args, options) => {
  if (!basename(file).startsWith("life-board-api")) return spawn(file, args, options)
  return spawn(join(root, "target/e2e/debug/life-board-api"), args, { ...options, env: { ...options.env, LIFE_BOARD_E2E_GITHUB_URL: githubUrl } })
}
if (scenario.updates) {
  // Only the test bootstrap emulates distribution detection. All resources and
  // the inert replacement artifact live in this test's temporary directory.
  Object.defineProperty(app, "isPackaged", { get: () => true })
  Object.defineProperty(process, "resourcesPath", { value: join(process.env.LIFE_BOARD_E2E_HOME, "resources") })
  process.env.APPIMAGE = join(process.env.LIFE_BOARD_E2E_HOME, "installed.AppImage")
  app.relaunch = options => { state.relaunch.push(options); record({ kind: "relaunch", options }) }
  require("./updates.cjs")()
}
require("./github-server.cjs")(record).then(url => {
  githubUrl = url
  require(join(root, "out/main/index.js"))
})
