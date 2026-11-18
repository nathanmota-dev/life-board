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

test("google calendar: import, read-only events, changes made in Google and disconnect", async ({ workspace, page }) => {
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

  // A Google event can't be dragged or edited, and opens in Google Calendar
  const box = (await meeting.first().boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 8 + 60, { steps: 6 })
  await page.mouse.up()
  expect((await events()).find(event => event.id === imported.id)?.startAt).toBe(imported.startAt)
  await meeting.first().click()
  const details = page.getByRole("dialog", { name: "Detalhes do evento", exact: true })
  await expect(details.getByRole("textbox", { name: "Título", exact: true })).toHaveAttribute("readonly", "")
  await expect(details.getByText("Google Agenda", { exact: true })).toBeVisible()
  await details.getByRole("button", { name: "Abrir no Google Agenda" }).click()
  await expect.poll(() => workspace.app.evaluate(() => globalThis.e2e.external.at(-1))).toBe("https://www.google.com/calendar/event?eid=synthetic-timed")
  expect((await workspace.api.patch(`calendar/events/${imported.id}`, { data: { title: "Edited" } })).status()).toBe(409)
  expect((await workspace.api.delete(`calendar/events/${imported.id}`)).status()).toBe(409)
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
