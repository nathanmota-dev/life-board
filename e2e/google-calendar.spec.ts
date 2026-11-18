import type { Page } from "@playwright/test"
import { test, expect, type Workspace } from "./fixtures"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Must match e2e/support/google-server.cjs.
const clientId = "synthetic-e2e-client.apps.googleusercontent.com"
const clientSecret = "synthetic-google-secret-for-e2e-only"
const refreshToken = "synthetic-google-refresh-token-for-e2e-only"
const email = "synthetic.user@gmail.com"

test("google calendar: save credentials, connect through the browser, restart and disconnect", async ({ workspace, page }) => {
  await workspace.go("Configurações")
  await page.getByRole("tab", { name: "Google Agenda", exact: true }).click()
  await page.getByLabel("ID do cliente", { exact: true }).fill(clientId)
  await page.getByLabel("Chave secreta do cliente", { exact: true }).fill(clientSecret)
  await page.getByRole("button", { name: "Salvar credenciais", exact: true }).click()
  await page.getByRole("button", { name: "Conectar Google Agenda", exact: true }).click()
  await expect(page.getByText("Termine o login no navegador. Esta tela se atualiza sozinha.", { exact: true })).toBeVisible()

  // Play the browser: read the consent URL the app opened and answer like Google would.
  const authUrl = new URL(await workspace.app.evaluate(() => globalThis.e2e.external.at(-1) ?? ""))
  expect(`${authUrl.origin}${authUrl.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth")
  expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256")
  expect(authUrl.searchParams.get("access_type")).toBe("offline")
  const apiUrl = await page.evaluate(() => window.desktop!.getApiBaseUrl())
  const redirect = authUrl.searchParams.get("redirect_uri")
  expect(redirect).toBe(`${apiUrl}/api/google/oauth/callback`)
  const callback = await workspace.api.get(`${redirect}?code=synthetic-google-code&state=${authUrl.searchParams.get("state")}`)
  expect(callback.status()).toBe(200)
  expect(await callback.text()).toContain("Conectado. Você pode voltar ao Life Board.")

  await expect(page.getByText(email, { exact: true })).toBeVisible()
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible()
  const database = readFileSync(join(workspace.home, "electron/life-board.db"))
  expect(database.includes(Buffer.from(refreshToken))).toBe(false)
  expect(database.includes(Buffer.from(clientSecret))).toBe(false)

  await workspace.restart()
  page = workspace.page
  await workspace.go("Configurações")
  await page.getByRole("tab", { name: "Google Agenda", exact: true }).click()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Desconectar", exact: true }).click()
  await expect(page.getByRole("button", { name: "Conectar Google Agenda", exact: true })).toBeVisible()
  const calls = readFileSync(join(workspace.home, "calls.jsonl"), "utf8")
  expect(calls).toContain('"url":"https://google.test/revoke"')
})

test("google calendar: a denied consent and a cancelled login go back to Connect", async ({ workspace, page }) => {
  await workspace.api.put("google/credentials", { data: { clientId, clientSecret } })
  await workspace.go("Configurações")
  await page.getByRole("tab", { name: "Google Agenda", exact: true }).click()
  await page.getByRole("button", { name: "Conectar Google Agenda", exact: true }).click()
  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeVisible()
  const authUrl = new URL(await workspace.app.evaluate(() => globalThis.e2e.external.at(-1) ?? ""))
  const denied = await workspace.api.get(`google/oauth/callback?error=access_denied&state=${authUrl.searchParams.get("state")}`)
  expect(denied.status()).toBe(400)
  expect(await denied.text()).toContain("Não foi possível conectar o Google Agenda.")
  await expect(page.getByRole("button", { name: "Conectar Google Agenda", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Conectar Google Agenda", exact: true }).click()
  await page.getByRole("button", { name: "Cancelar", exact: true }).click()
  await expect(page.getByRole("button", { name: "Conectar Google Agenda", exact: true })).toBeVisible()
  const late = new URL(await workspace.app.evaluate(() => globalThis.e2e.external.at(-1) ?? ""))
  const refused = await workspace.api.get(`google/oauth/callback?code=synthetic-google-code&state=${late.searchParams.get("state")}`)
  expect(refused.status()).toBe(400)
  expect((await workspace.api.get("google/status").then(response => response.json())).connected).toBe(false)
})

type StoredEvent = { id: string; title: string; startAt: string; endAt: string; allDay: boolean; source: "local" | "google"; externalUrl: string | null; recurringEventId: string | null }

async function connectAccount(workspace: Workspace, page: Page) {
  await workspace.api.put("google/credentials", { data: { clientId, clientSecret } })
  await workspace.go("Configurações")
  await page.getByRole("tab", { name: "Google Agenda", exact: true }).click()
  await page.getByRole("button", { name: "Conectar Google Agenda", exact: true }).click()
  await expect.poll(() => workspace.app.evaluate(() => globalThis.e2e.external.at(-1) ?? "")).toContain("accounts.google.com")
  const authUrl = new URL(await workspace.app.evaluate(() => globalThis.e2e.external.at(-1) ?? ""))
  const callback = await workspace.api.get(`google/oauth/callback?code=synthetic-google-code&state=${authUrl.searchParams.get("state")}`)
  expect(callback.status()).toBe(200)
  await expect(page.getByText(email, { exact: true })).toBeVisible()
}

test("google calendar: import, editable events, changes made in Google and disconnect", async ({ workspace, page }) => {
  const events = () => workspace.list<StoredEvent>("calendar/events?limit=100")
  const titles = async () => (await events()).map(event => event.title).sort()
  await workspace.create("calendar/events", { title: "Local lunch", startAt: "2026-10-13T15:00:00Z", endAt: "2026-10-13T16:00:00Z" })
  await connectAccount(workspace, page)

  // Sync now imports the primary calendar: a timed event, an all-day event and two occurrences of a series
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click()
  await expect(page.getByText("Nunca", { exact: true })).toHaveCount(0)
  await expect.poll(titles).toEqual(["Local lunch", "Synthetic conflict", "Synthetic meeting", "Synthetic standup", "Synthetic standup", "Synthetic trip"])
  const imported = (await events()).find(event => event.title === "Synthetic meeting")!
  expect(imported).toMatchObject({ source: "google", startAt: "2026-10-12T12:00:00.000Z", externalUrl: "https://www.google.com/calendar/event?eid=synthetic-timed" })
  expect((await events()).find(event => event.title === "Synthetic trip")).toMatchObject({ allDay: true, startAt: "2026-10-14T00:00:00.000Z", endAt: "2026-10-16T00:00:00.000Z" })
  expect((await events()).filter(event => event.recurringEventId === "synthetic-series")).toHaveLength(2)

  // They show in the week and month views
  await workspace.go("Calendário")
  await page.getByRole("button", { name: /^Anterior: / }).click()
  const meeting = page.getByRole("button", { name: /^Synthetic meeting,/ })
  await expect(meeting.first()).toBeVisible()
  await expect(page.getByRole("button", { name: /^Synthetic trip,/ }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /^Synthetic standup,/ }).nth(1)).toBeVisible()
  await expect(page.getByRole("button", { name: /^Local lunch,/ }).first()).toBeVisible()
  await page.getByRole("button", { name: "Semana", exact: true }).click()
  await page.getByRole("menuitem", { name: /^Mês/ }).click()
  await expect(page.getByRole("button", { name: /^Synthetic meeting,/ }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /^Synthetic standup,/ }).nth(1)).toBeVisible()
  await page.getByRole("button", { name: "Mês", exact: true }).click()
  await page.getByRole("menuitem", { name: /^Semana/ }).click()

  // A Google event opens in Google Calendar, and says that its changes apply to one occurrence only when it is one
  await meeting.first().click()
  const details = page.getByRole("dialog", { name: "Detalhes do evento", exact: true })
  await expect(details.getByRole("textbox", { name: "Título", exact: true })).not.toHaveAttribute("readonly", "")
  await expect(details.getByText("Google Agenda", { exact: true })).toBeVisible()
  await details.getByRole("button", { name: "Abrir no Google Agenda" }).click()
  await expect.poll(() => workspace.app.evaluate(() => globalThis.e2e.external.at(-1))).toBe("https://www.google.com/calendar/event?eid=synthetic-timed")
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: /^Synthetic standup,/ }).first().click()
  await expect(details.getByText("As alterações valem só para esta ocorrência.", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")

  // The calendar changed in Google: one event is gone and another has a new title
  workspace.setScenario({ google: "changed" })
  await workspace.go("Configurações")
  await page.getByRole("tab", { name: "Google Agenda", exact: true }).click()
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click()
  await expect.poll(titles).toEqual(["Local lunch", "Synthetic conflict", "Synthetic meeting renamed", "Synthetic standup", "Synthetic standup"])
  await workspace.go("Calendário")
  await page.getByRole("button", { name: /^Anterior: / }).click()
  await expect(page.getByRole("button", { name: /^Synthetic meeting renamed,/ }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /^Synthetic trip,/ })).toHaveCount(0)

  // Disconnecting removes the Google events and keeps the local ones
  await workspace.go("Configurações")
  await page.getByRole("tab", { name: "Google Agenda", exact: true }).click()
  await page.getByRole("button", { name: "Desconectar", exact: true }).click()
  await expect(page.getByRole("button", { name: "Conectar Google Agenda", exact: true })).toBeVisible()
  await expect.poll(titles).toEqual(["Local lunch"])
  expect((await events())[0]).toMatchObject({ source: "local", externalUrl: null })
})

type GoogleCall = { kind: string; url: string; method: string; ifMatch?: string; dropped?: boolean; body?: { summary?: string; start?: { dateTime?: string | null; date?: string | null } } }
type GoogleStatus = { pendingChanges: number; lastConflict: { title: string } | null }

test("google calendar: events created, moved, edited and deleted here reach Google", async ({ workspace, page }) => {
  const calls = () => readFileSync(join(workspace.home, "calls.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as GoogleCall)
  const received = (method: string) => calls().filter(call => call.kind === "google" && call.method === method && !call.dropped && /\/events(\/|$)/.test(call.url) && !call.url.includes("?"))
  const events = () => workspace.list<StoredEvent & { syncState: string | null }>("calendar/events?limit=100")
  const status = async () => (await workspace.api.get("google/status")).json() as Promise<GoogleStatus>
  await connectAccount(workspace, page)
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click()
  await expect(page.getByText("Nunca", { exact: true })).toHaveCount(0)

  // An event created in the week view reaches Google within seconds, and its mark goes away
  await workspace.go("Calendário")
  await page.getByRole("button", { name: "Novo evento", exact: true }).click()
  const details = page.getByRole("dialog", { name: "Detalhes do evento", exact: true })
  await expect(details.getByRole("textbox", { name: "Título", exact: true })).toBeFocused()
  await page.keyboard.type("Sent to Google")
  await page.keyboard.press("Enter")
  await expect.poll(() => received("POST").length).toBe(1)
  await expect.poll(() => received("PATCH").at(-1)?.body?.summary).toBe("Sent to Google")
  await expect.poll(async () => (await status()).pendingChanges).toBe(0)
  await page.keyboard.press("Escape")
  const chip = page.getByRole("button", { name: /^Sent to Google,/ }).first()
  await expect(chip).toBeVisible()
  await expect(page.getByTestId("event-sync-mark")).toHaveCount(0)
  expect(received("POST")).toHaveLength(1)

  // Moving it to another day sends one PATCH, guarded by the etag Google gave (the drag itself is covered in calendar-files.spec.ts)
  await expect.poll(async () => (await events()).some(event => event.title === "Sent to Google" && event.syncState === null)).toBe(true)
  const before = received("PATCH").length
  const created = (await events()).find(event => event.title === "Sent to Google")!
  const day = created.allDay ? "T00:00:00.000Z" : created.startAt.slice(10)
  const move = (value: string) => `2026-10-22${value.length > 10 ? value.slice(10) : "T00:00:00.000Z"}`
  expect((await workspace.api.patch(`calendar/events/${created.id}`, { data: { startAt: move(created.startAt), endAt: move(created.endAt) } })).status()).toBe(200)
  expect(day).toBeTruthy()
  await expect.poll(() => received("PATCH").length).toBe(before + 1)
  const moved = received("PATCH").at(-1)!
  // The insert answered version 1, and each PATCH since then added one.
  expect(moved.ifMatch).toBe(`"synthetic-event-1-${before + 1}"`)
  expect(moved.body?.start?.dateTime ?? moved.body?.start?.date).toMatch(/^2026-10-22/)

  // Editing an imported Google event and deleting one occurrence of a series reach Google too
  const listed = await events()
  const meeting = listed.find(event => event.title === "Synthetic meeting")!
  const occurrence = listed.filter(event => event.recurringEventId === "synthetic-series")[0]
  expect((await workspace.api.patch(`calendar/events/${meeting.id}`, { data: { title: "Synthetic meeting moved" } })).status()).toBe(200)
  expect((await workspace.api.delete(`calendar/events/${occurrence.id}`)).status()).toBe(200)
  await expect.poll(() => received("PATCH").find(call => call.url.endsWith("/events/synthetic-timed"))?.ifMatch).toBe('"synthetic-timed-1"')
  expect(occurrence.startAt).toBe("2026-10-13T12:00:00.000Z")
  await expect.poll(() => received("DELETE").map(call => call.url.split("/").at(-1))).toEqual(["synthetic-series_20261013T120000Z"])
  await expect.poll(async () => (await status()).pendingChanges).toBe(0)

  // Google changed the same event: its version is kept, and Settings says so
  const conflict = listed.find(event => event.title === "Synthetic conflict")!
  expect((await workspace.api.patch(`calendar/events/${conflict.id}`, { data: { title: "My version" } })).status()).toBe(200)
  await expect.poll(async () => (await events()).find(event => event.id === conflict.id)?.title).toBe("Synthetic conflict from Google")
  await expect.poll(async () => (await status()).lastConflict?.title).toBe("My version")
  await workspace.go("Configurações")
  // The status changed behind React Query's back, so load it again
  await page.reload()
  await page.getByRole("tab", { name: "Google Agenda", exact: true }).click()
  await expect(page.getByTestId("google-conflict")).toContainText("My version")

  // With Google unreachable the change stays pending and the calendar keeps working
  const sent = (await events()).find(event => event.title === "Sent to Google")!
  workspace.setScenario({ google: "offline" })
  expect((await workspace.api.patch(`calendar/events/${sent.id}`, { data: { title: "Edited offline" } })).status()).toBe(200)
  await expect.poll(() => calls().some(call => call.kind === "google" && call.dropped)).toBe(true)
  expect((await events()).find(event => event.id === sent.id)).toMatchObject({ title: "Edited offline", syncState: "pending_update" })
  expect((await status()).pendingChanges).toBe(1)
  await page.reload()
  await page.getByRole("tab", { name: "Google Agenda", exact: true }).click()
  await expect(page.getByText("1 alteração", { exact: true })).toBeVisible()

  // Once Google answers again it goes out, with no duplicate
  workspace.setScenario({ google: undefined })
  const patches = received("PATCH").length
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click()
  await expect.poll(() => received("PATCH").length).toBe(patches + 1)
  expect(received("PATCH").at(-1)?.body?.summary).toBe("Edited offline")
  await expect.poll(async () => (await status()).pendingChanges).toBe(0)
  expect(received("POST")).toHaveLength(1)
  expect((await events()).filter(event => event.title === "Edited offline")).toHaveLength(1)
})
