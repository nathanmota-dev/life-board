import { test, expect } from "./fixtures"
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
