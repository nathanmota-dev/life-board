const { createServer } = require("node:http")

// The sidecar reaches this server instead of oauth2.googleapis.com and
// www.googleapis.com, so the suite exercises the real OAuth client without Google.
const CLIENT_ID = "synthetic-e2e-client.apps.googleusercontent.com"
const CLIENT_SECRET = "synthetic-google-secret-for-e2e-only"
const CODE = "synthetic-google-code"
const REFRESH_TOKEN = "synthetic-google-refresh-token-for-e2e-only"
const ACCESS_TOKEN = "synthetic-google-access-token"
const EMAIL = "synthetic.user@gmail.com"

function answer(request, body) {
  const url = new URL(request.url, "http://127.0.0.1")
  const form = new URLSearchParams(body)
  if (request.method === "POST" && url.pathname === "/token") {
    if (form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) return [401, { error: "invalid_client" }]
    const exchange = form.get("grant_type") === "authorization_code" && form.get("code") === CODE && (form.get("code_verifier") ?? "").length >= 43
    const refresh = form.get("grant_type") === "refresh_token" && form.get("refresh_token") === REFRESH_TOKEN
    if (exchange) return [200, { access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, expires_in: 3599, token_type: "Bearer" }]
    if (refresh) return [200, { access_token: ACCESS_TOKEN, expires_in: 3599, token_type: "Bearer" }]
    return [400, { error: "invalid_grant" }]
  }
  if (request.method === "POST" && url.pathname === "/revoke") return form.get("token") === REFRESH_TOKEN ? [200, {}] : [400, { error: "invalid_token" }]
  if (request.method === "GET" && url.pathname === "/calendar/v3/calendars/primary") {
    return request.headers.authorization === `Bearer ${ACCESS_TOKEN}` ? [200, { id: EMAIL, summary: EMAIL }] : [401, { error: { code: 401 } }]
  }
  return null
}

module.exports = function startGoogleServer(record) {
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const url = `https://google.test${request.url}`
    record({ kind: "google", url, method: request.method })
    const result = answer(request, Buffer.concat(chunks).toString())
    if (!result) {
      record({ kind: "unexpected", url, message: "Unexpected Google request" })
      return response.writeHead(500).end("Unexpected Google request")
    }
    response.writeHead(result[0], { "content-type": "application/json" }).end(JSON.stringify(result[1]))
  })
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)))
}

Object.assign(module.exports, { CLIENT_ID, CLIENT_SECRET, CODE, REFRESH_TOKEN, EMAIL })
