import { app } from "electron"

// Runs the network service inside the browser process: one process fewer, at the cost of a
// network crash taking the whole app down instead of restarting that process.
const IN_PROCESS_FEATURES = ["NetworkServiceInProcess2"]

/** Must run before `app` is ready. Linux only: no package is validated on other systems. */
export function applyChromiumSwitches() {
  if (process.platform !== "linux") return
  // A second `enable-features` would replace one given on the command line, so merge them.
  const current = app.commandLine.getSwitchValue("enable-features").split(",").filter(Boolean)
  const features = [...new Set([...current, ...IN_PROCESS_FEATURES])]
  app.commandLine.appendSwitch("enable-features", features.join(","))
}
