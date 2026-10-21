const { readFileSync } = require("node:fs")

// Real timers keep running; only wall-clock time changes. The main and utility
// processes read the same offset when tests advance a pomodoro or calendar day.
module.exports = function installClock() {
  const RealDate = Date
  const origin = RealDate.now()
  const epoch = Number(process.env.LIFE_BOARD_E2E_EPOCH)
  const now = () => {
    const offset = Number(readFileSync(process.env.LIFE_BOARD_E2E_CLOCK, "utf8"))
    return epoch + RealDate.now() - origin + offset
  }
  globalThis.Date = new Proxy(RealDate, {
    construct: (target, args) => Reflect.construct(target, args.length ? args : [now()]),
    get: (target, key) => key === "now" ? now : Reflect.get(target, key),
  })
}
