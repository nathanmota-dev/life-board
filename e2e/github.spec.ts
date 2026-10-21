import { test, expect } from "./fixtures"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const token = "synthetic-token-for-e2e-only"

test("github: invalid token, connect, sync, filters, contributions, links and disconnect", async ({ workspace, page }) => {
  await workspace.go("GitHub")
  await expect(page.getByText("Conecte sua conta do GitHub", { exact: true })).toBeVisible()
  await workspace.go("Configurações")
  await page.getByRole("tab", { name: "GitHub", exact: true }).click()
  await page.getByLabel("Token de acesso pessoal", { exact: true }).fill("invalid-synthetic-token")
  await page.getByRole("button", { name: "Conectar GitHub", exact: true }).click()
  await expect(page.getByText("O token do GitHub é inválido ou não tem as permissões necessárias.", { exact: true })).toBeVisible()
  await page.getByLabel("Token de acesso pessoal", { exact: true }).fill(token)
  await page.getByLabel("Apenas este proprietário ou organização (opcional)", { exact: true }).fill("synthetic-user")
  await page.getByRole("button", { name: "Conectar GitHub", exact: true }).click()
  await expect(page.getByRole("button", { name: "Sincronizar agora", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click()
  await workspace.go("GitHub")
  await expect(page.getByText("Synthetic pull request", { exact: true }).first()).toBeVisible()
  for (const name of ["Criados por você", "Revisão solicitada", "Menções", "Atribuídos a você", "Meus repositórios"]) {
    await page.getByRole("tab", { name, exact: true }).click()
    await expect(page.getByText("Synthetic pull request", { exact: true })).toBeVisible()
  }
  await page.getByRole("tab", { name: "Criados por você", exact: true }).click()
  await page.getByRole("button", { name: "Abrir Synthetic pull request no GitHub", exact: true }).click()
  expect(await workspace.app.evaluate(() => globalThis.e2e.external)).toContain("https://github.com/synthetic-user/life-board/pull/1")
  await page.getByRole("tab", { name: "Issues", exact: true }).click()
  await expect(page.getByText("Synthetic issue", { exact: true }).first()).toBeVisible()
  for (const name of ["Criados por você", "Menções", "Atribuídos a você", "Meus repositórios"]) {
    await page.getByRole("tab", { name, exact: true }).click()
    await expect(page.getByText("Synthetic issue", { exact: true })).toBeVisible()
  }
  await workspace.go("Painel")
  await expect(page.getByText("3 contribuições no último ano", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: /life-board synthetic-user/ })).toBeVisible()
  expect(readFileSync(join(workspace.home, "electron/life-board.db")).includes(Buffer.from(token))).toBe(false)
  await workspace.restart()
  page = workspace.page
  await workspace.go("Configurações")
  await page.getByRole("tab", { name: "GitHub", exact: true }).click()
  await page.getByRole("button", { name: "Desconectar", exact: true }).click()
  await page.getByRole("button", { name: "Cancelar", exact: true }).click()
  await expect(page.getByRole("button", { name: "Desconectar", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Desconectar", exact: true }).click()
  await page.getByRole("button", { name: "Desconectar e apagar token", exact: true }).click()
  await expect(page.getByLabel("Token de acesso pessoal", { exact: true })).toBeVisible()
  expect(await workspace.list("github/prs")).toHaveLength(0)
  expect(await workspace.list("github/issues")).toHaveLength(0)
})

test("github: synchronization error can be retried without losing the connection", async ({ workspace, page }) => {
  await workspace.create("github/connect", { token })
  await workspace.go("Configurações")
  await page.getByRole("tab", { name: "GitHub", exact: true }).click()
  workspace.setScenario({ github: "error" })
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click()
  await expect(page.getByText("Não foi possível sincronizar com o GitHub. Tente novamente.", { exact: true })).toBeVisible()
  workspace.setScenario({ github: undefined })
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click()
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible()
  await workspace.go("GitHub")
  await expect(page.getByText("Synthetic pull request", { exact: true }).first()).toBeVisible()
  workspace.setScenario({ github: "rate-limit" })
  await page.getByRole("button", { name: "Sincronizar", exact: true }).click()
  await expect(page.getByText("Não foi possível sincronizar com o GitHub. Tente novamente.", { exact: true })).toBeVisible()
  await expect(page.getByText("Synthetic pull request", { exact: true }).first()).toBeVisible()
})

test.describe("empty remote account", () => {
  test.use({ scenario: { github: "empty" } })
  test("github: empty PR and issue results", async ({ workspace, page }) => {
    await workspace.create("github/connect", { token })
    await workspace.create("github/sync", {})
    await workspace.go("GitHub")
    await expect(page.getByText("Nenhum pull request", { exact: true })).toBeVisible()
    await page.getByRole("tab", { name: "Issues", exact: true }).click()
    await expect(page.getByText("Nenhuma issue", { exact: true })).toBeVisible()
  })
})
