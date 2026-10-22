import { test, expect } from "./fixtures"
import { readFileSync, chmodSync } from "node:fs"
import { join } from "node:path"
import { inc } from "semver"

const nextVersion = inc(JSON.parse(readFileSync("package.json", "utf8")).version, "patch")!

test.describe("controlled updater", () => {
  test.use({ scenario: { updates: "available" } })

  test("updates: discovery, notes, external link, progress across pages and cancellation", async ({ workspace, page }) => {
    await workspace.go("Configurações")
    await page.getByRole("tab", { name: "Atualizações", exact: true }).click()
    await expect(page.getByText("Uma nova versão está disponível.", { exact: true })).toBeVisible()
    await expect(page.getByText("Synthetic release notes", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Baixar atualização", exact: true })).toBeEnabled()
    await page.getByRole("link", { name: "Ver lançamento no GitHub", exact: true }).click()
    expect(await workspace.app.evaluate(() => globalThis.e2e.external)).toContain(`https://github.com/nathanmota-dev/life-board/releases/tag/v${nextVersion}`)
    workspace.setScenario({ updates: "hold-download" })
    await page.getByRole("button", { name: "Baixar atualização", exact: true }).click()
    await expect(page.getByRole("progressbar", { name: "Progresso do download", exact: true })).toHaveAttribute("value", "25")
    await workspace.go("Tarefas")
    await page.getByRole("link", { name: `Atualização ${nextVersion} disponível`, exact: true }).click()
    await workspace.ready("Configurações")
    await expect(page).toHaveURL(/tab=updates/)
    await expect(page.getByText("25%", { exact: true })).toBeVisible()
    workspace.setScenario({ updates: "available" })
    await page.getByRole("button", { name: "Instalar e reiniciar", exact: true }).click()
    await page.getByRole("button", { name: "Cancelar", exact: true }).click()
    expect(await workspace.app.evaluate(() => globalThis.e2e.relaunch)).toHaveLength(0)
    await expect(page.getByText("A atualização foi verificada e está pronta para instalar.", { exact: true })).toBeVisible()
  })

  test("updates: network and checksum errors allow recovery", async ({ workspace, page }) => {
    await workspace.go("Configurações")
    await page.getByRole("tab", { name: "Atualizações", exact: true }).click()
    workspace.setScenario({ updates: "network" })
    await page.getByRole("button", { name: "Verificar atualizações", exact: true }).click()
    await expect(page.getByRole("alert")).toContainText("Não foi possível acessar")
    workspace.setScenario({ updates: "available" })
    await page.getByRole("button", { name: "Verificar atualizações", exact: true }).click()
    workspace.setScenario({ updates: "integrity" })
    await page.getByRole("button", { name: "Baixar atualização", exact: true }).click()
    await expect(page.getByRole("alert")).toContainText("soma de verificação")
    workspace.setScenario({ updates: "available" })
    await page.getByRole("button", { name: "Baixar atualização", exact: true }).click()
    await expect(page.getByRole("button", { name: "Instalar e reiniciar", exact: true })).toBeEnabled()
    chmodSync(workspace.home, 0o555)
    try {
      await page.getByRole("button", { name: "Instalar e reiniciar", exact: true }).click()
      await page.getByRole("dialog").getByRole("button", { name: "Instalar e reiniciar", exact: true }).click()
      await expect(page.getByRole("alert")).toContainText("autorização")
      expect(await workspace.app.evaluate(() => globalThis.e2e.relaunch)).toHaveLength(0)
    } finally { chmodSync(workspace.home, 0o700) }
  })

  for (const paused of [false, true]) {
    test(`updates: simulated restart preserves data and ${paused ? "paused" : "running"} pomodoro`, async ({ workspace, page }) => {
      await workspace.create("tasks", { title: "Preserved across update" })
      await workspace.go("Pomodoro")
      await page.getByRole("button", { name: "Iniciar", exact: true }).click()
      if (paused) await page.getByRole("button", { name: "Pausar", exact: true }).click()
      await workspace.go("Configurações")
      await page.getByRole("tab", { name: "Atualizações", exact: true }).click()
      await page.getByRole("button", { name: "Baixar atualização", exact: true }).click()
      await page.getByRole("button", { name: "Instalar e reiniciar", exact: true }).click()
      await workspace.checkpoint()
      workspace.stopping = true
      const closed = workspace.app.waitForEvent("close")
      await page.getByRole("dialog").getByRole("button", { name: "Instalar e reiniciar", exact: true }).click()
      await closed
      const calls = readFileSync(join(workspace.home, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line))
      expect(calls.filter(call => call.kind === "relaunch")).toHaveLength(1)
      await workspace.start()
      page = workspace.page
      await workspace.go("Pomodoro")
      await expect(page.getByRole("button", { name: paused ? "Retomar" : "Pausar", exact: true })).toBeVisible()
      expect((await page.evaluate(() => window.desktop!.pomodoro!.getState())).status).toBe(paused ? "paused" : "running")
      expect(await workspace.list("tasks")).toEqual([expect.objectContaining({ title: "Preserved across update" })])
    })
  }
})

test.describe("current version", () => {
  test.use({ scenario: { updates: "current" } })
  test("updates: up-to-date state and manual check", async ({ workspace, page }) => {
    await workspace.go("Configurações")
    await page.getByRole("tab", { name: "Atualizações", exact: true }).click()
    await expect(page.getByText("O Life Board está atualizado.", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Verificar atualizações", exact: true }).click()
    await expect(page.getByText("O Life Board está atualizado.", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Baixar atualização", exact: true })).toHaveCount(0)
  })
})
