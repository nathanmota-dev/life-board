import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import { app } from "electron"

const AUTOSTART_FILE = "dev.nathanmota.lifeboard.desktop"

function autostartPath() {
  const config = process.env.XDG_CONFIG_HOME
  const directory = config && isAbsolute(config) ? config : join(app.getPath("home"), ".config")
  return join(directory, "autostart", AUTOSTART_FILE)
}

function loginCommand() {
  // AppImage's execPath points into a temporary mount that disappears on exit.
  const appImage = process.platform === "linux" ? process.env.APPIMAGE : undefined
  const path = appImage || process.execPath
  const args = app.isPackaged || appImage ? [] : [app.getAppPath()]
  if (process.argv.includes("--no-sandbox")) args.push("--no-sandbox")
  args.push("--hidden")
  return { path, args }
}

function quoteDesktopArgument(value: string) {
  // Desktop entries apply string escaping before command-line unquoting.
  const escaped = value.replace(/\\/g, "\\\\\\\\").replace(/["`$]/g, "\\\\$&").replace(/%/g, "%%")
    .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
  return `"${escaped}"`
}

export function getStartOnLogin() {
  if (process.platform === "linux") {
    let contents: string
    try {
      contents = readFileSync(autostartPath(), "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
      throw error
    }
    const entry = contents.split(/^\[Desktop Entry\]\s*$/m)[1]?.split(/^\[/m)[0] ?? ""
    return /^Type=Application\s*$/m.test(entry) && /^Exec=\S.+$/m.test(entry)
      && !/^Hidden=true\s*$/m.test(entry) && !/^X-GNOME-Autostart-enabled=false\s*$/m.test(entry)
  }
  const settings = app.getLoginItemSettings(process.platform === "win32" ? loginCommand() : undefined)
  if (process.platform === "win32") return settings.openAtLogin && settings.executableWillLaunchAtLogin
  return settings.openAtLogin && settings.status === "enabled"
}

export function setStartOnLogin(enabled: boolean) {
  if (process.platform !== "linux") {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      ...(process.platform === "win32" ? { ...loginCommand(), enabled } : {}),
    })
    return
  }
  const path = autostartPath()
  if (!enabled) {
    rmSync(path, { force: true })
    return
  }
  const command = loginCommand()
  // GLib checks the executable before expanding %% field codes. Let env resolve
  // paths containing a percent sign after that expansion has happened.
  const executable = command.path.includes("%") ? ["/usr/bin/env", command.path] : [command.path]
  const entry = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Life Board",
    `Exec=${[...executable, ...command.args].map(quoteDesktopArgument).join(" ")}`,
    "Icon=life-board-app",
    "Terminal=false",
    "StartupNotify=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n")
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, entry, { mode: 0o600 })
}

export function isHiddenStartup() {
  return process.argv.includes("--hidden")
    || (process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin)
}
