const { createServer } = require("node:http")

// The sidecar reaches this server instead of oauth2.googleapis.com and
// www.googleapis.com, so the suite exercises the real OAuth and Calendar clients
// without Google.
const CLIENT_ID = "synthetic-e2e-client.apps.googleusercontent.com"
const CLIENT_SECRET = "synthetic-google-secret-for-e2e-only"
const CODE = "synthetic-google-code"
const REFRESH_TOKEN = "synthetic-google-refresh-token-for-e2e-only"
const ACCESS_TOKEN = "synthetic-google-access-token"
const EMAIL = "synthetic.user@gmail.com"
// Patching this event always answers 412, as if it had just changed in Google.
const CONFLICT_EVENT_ID = "synthetic-conflict"
const EVENTS_PATH = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/
const LIST_PARAMS = ["singleEvents", "showDeleted", "timeMin", "timeMax", "maxResults"]

// The primary calendar, listed in two pages: the first event, then the rest.
function seedEvents() {
  const event = (id, fields) => ({ id, status: "confirmed", etag: `"${id}-1"`, updated: "2026-10-01T12:00:00.000Z", htmlLink: `https://calendar.google.test/event?eid=${id}`, ...fields })
  return new Map([
    event("synthetic-timed", { summary: "Synthetic meeting", start: { dateTime: "2026-10-12T09:00:00-03:00" }, end: { dateTime: "2026-10-12T10:00:00-03:00" }, colorId: "7" }),
    event("synthetic-all-day", { summary: "Synthetic trip", start: { date: "2026-10-14" }, end: { date: "2026-10-17" } }),
    event(CONFLICT_EVENT_ID, { summary: "Synthetic conflict", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } }),
  ].map(item => [item.id, item]))
}

function listEvents(events, url) {
  if (LIST_PARAMS.some(name => !url.searchParams.has(name)) || url.searchParams.get("singleEvents") !== "true" || url.searchParams.get("showDeleted") !== "true") return [400, { error: { code: 400, message: "Missing list parameters" } }]
  const items = [...events.values()]
  if (url.searchParams.get("pageToken") === "page-2") return [200, { items: items.slice(1) }]
  return [200, { items: items.slice(0, 1), nextPageToken: "page-2" }]
}

function calendarEvents(calendar, request, url, body) {
  const [, calendarId, eventId] = url.pathname.match(EVENTS_PATH).map(part => part && decodeURIComponent(part))
  if (calendarId !== EMAIL && calendarId !== "primary") return [404, { error: { code: 404, message: "Not Found" } }]
  const { events } = calendar
  if (!eventId && request.method === "GET") return listEvents(events, url)
  if (!eventId && request.method === "POST") {
    const id = `synthetic-event-${++calendar.created}`
    const event = { ...JSON.parse(body), id, status: "confirmed", etag: `"${id}-1"`, updated: new Date().toISOString() }
    events.set(id, event)
    return [200, event]
  }
  const event = events.get(eventId)
  if (!event || event.status === "cancelled") return [request.method === "DELETE" ? 410 : 404, { error: { code: 404, message: "Not Found" } }]
  if (request.method === "PATCH") {
    if (eventId === CONFLICT_EVENT_ID || request.headers["if-match"] !== event.etag) return [412, { error: { code: 412, message: "Precondition Failed", errors: [{ reason: "conditionNotMet" }] } }]
    const version = Number(event.etag.slice(event.etag.lastIndexOf("-") + 1, -1)) + 1
    const patched = { ...event, ...JSON.parse(body), etag: `"${eventId}-${version}"`, updated: new Date().toISOString() }
    events.set(eventId, patched)
    return [200, patched]
  }
  if (request.method === "DELETE") {
    events.set(eventId, { id: eventId, status: "cancelled" })
    return [204, null]
  }
  return null
}

function answer(calendar, request, body) {
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
    return request.headers.authorization === `Bearer ${ACCESS_TOKEN}` ? [200, { id: EMAIL, summary: EMAIL, timeZone: "America/Sao_Paulo" }] : [401, { error: { code: 401 } }]
  }
  if (EVENTS_PATH.test(url.pathname)) {
    return request.headers.authorization === `Bearer ${ACCESS_TOKEN}` ? calendarEvents(calendar, request, url, body) : [401, { error: { code: 401 } }]
  }
  return null
}

module.exports = function startGoogleServer(record) {
  const calendar = { events: seedEvents(), created: 0 }
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const url = `https://google.test${request.url}`
    record({ kind: "google", url, method: request.method })
    let result
    try { result = answer(calendar, request, Buffer.concat(chunks).toString()) } catch (error) { result = [400, { error: { code: 400, message: error.message } }] }
    if (!result) {
      record({ kind: "unexpected", url, message: "Unexpected Google request" })
      return response.writeHead(500).end("Unexpected Google request")
    }
    if (result[1] === null) return response.writeHead(result[0]).end()
    response.writeHead(result[0], { "content-type": "application/json" }).end(JSON.stringify(result[1]))
  })
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)))
}

Object.assign(module.exports, { CLIENT_ID, CLIENT_SECRET, CODE, REFRESH_TOKEN, ACCESS_TOKEN, EMAIL, CONFLICT_EVENT_ID })
