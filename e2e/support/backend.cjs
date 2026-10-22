const { readFileSync, appendFileSync } = require("node:fs")
require("./clock.cjs")()
const github = require("./github.cjs")
const originalFetch = globalThis.fetch
const record = value => appendFileSync(process.env.LIFE_BOARD_E2E_CALLS, JSON.stringify(value) + "\n")
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input)
  record({ kind: "github", url, method: init?.method || "GET" })
  if (url.startsWith("https://api.github.com/")) {
    const scenario = JSON.parse(readFileSync(process.env.LIFE_BOARD_E2E_SCENARIO, "utf8"))
    if (scenario.github === "live") return originalFetch(input, init)
    try { return github(url, init, JSON.parse(readFileSync(process.env.LIFE_BOARD_E2E_SCENARIO, "utf8"))) }
    catch (error) { record({ kind: "unexpected", url, message: error.message }); throw error }
  }
  if (/^http:\/\/127\.0\.0\.1[:/]/.test(url)) return originalFetch(input, init)
  record({ kind: "unexpected", url })
  throw new Error(`Unexpected external request in backend: ${url}`)
}
require(process.env.LIFE_BOARD_E2E_BACKEND_MODULE)
