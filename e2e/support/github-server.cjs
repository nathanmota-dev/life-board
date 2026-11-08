const { readFileSync } = require("node:fs")
const { createServer } = require("node:http")
const github = require("./github.cjs")

const GITHUB = "https://api.github.com"
const FORWARDED = ["accept", "authorization", "content-type", "user-agent", "x-github-api-version"]

// The sidecar reaches this server instead of api.github.com, so the suite still
// exercises the real HTTP client and records every call it makes.
module.exports = function startGithubServer(record) {
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const url = `${GITHUB}${request.url}`
    const headers = Object.fromEntries(FORWARDED.filter(name => request.headers[name]).map(name => [name, request.headers[name]]))
    const init = { method: request.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks).toString() } : {}) }
    record({ kind: "github", url, method: request.method })
    try {
      const scenario = JSON.parse(readFileSync(process.env.LIFE_BOARD_E2E_SCENARIO, "utf8"))
      const answer = scenario.github === "live" ? await fetch(url, init) : github(url, init, scenario)
      response.writeHead(answer.status, { "content-type": answer.headers.get("content-type") ?? "text/plain" })
      response.end(Buffer.from(await answer.arrayBuffer()))
    } catch (error) {
      record({ kind: "unexpected", url, message: error.message })
      response.writeHead(500).end(error.message)
    }
  })
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)))
}
