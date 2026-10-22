import { test, expect } from "./fixtures"
import { spawn } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

test("pomodoro: real IPC controls, phases, settings, persistence and weather", async ({ workspace, page }) => {
  await workspace.go("Pomodoro")
  await page.getByRole("switch", { name: /^Pausas / }).click()
  await expect(page.getByText("Synthetic City", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Céu limpo", { exact: true }).first()).toBeVisible()
  await page.getByRole("button", { name: /^Longo / }).click()
  await expect(page.getByRole("timer")).toHaveText("50:00")
  await page.getByRole("button", { name: "Diminuir Foco", exact: true }).click()
  await expect(page.getByRole("timer")).toHaveText("45:00")
  await page.getByRole("button", { name: "Iniciar", exact: true }).click()
  await expect(page.getByRole("button", { name: "Pausar", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Pausar", exact: true }).click()
  await expect(page.getByRole("button", { name: "Retomar", exact: true })).toBeVisible()
  await workspace.go("Tarefas")
  await workspace.go("Pomodoro")
  await page.getByRole("button", { name: "Retomar", exact: true }).click()
  await page.getByRole("button", { name: "Reiniciar", exact: true }).click()
  await expect(page.getByRole("timer")).toHaveText("45:00")
  await page.getByRole("tab", { name: "Pausa longa", exact: true }).click()
  await page.getByRole("button", { name: "Pular para a próxima fase", exact: true }).click()
  await expect(page.getByRole("tab", { name: "Foco", exact: true })).toHaveAttribute("aria-selected", "true")
  await page.getByRole("switch", { name: /^Pausas / }).click()
  await expect(page.getByRole("tab", { name: "Pausa curta", exact: true })).toHaveCount(0)
  await page.getByRole("switch", { name: /^Som / }).click()
  await page.getByRole("button", { name: "Enviar notificação de teste", exact: true }).click()
  await expect.poll(() => workspace.app.evaluate(() => globalThis.e2e.notifications.length)).toBe(1)
  await workspace.restart()
  page = workspace.page
  await workspace.go("Pomodoro")
  await expect(page.getByRole("switch", { name: /^Pausas / })).not.toBeChecked()
  await expect(page.getByRole("switch", { name: /^Som / })).not.toBeChecked()
  await expect(page.getByRole("timer")).toHaveText("45:00")
})

test("pomodoro: clock completion, stats, auto start, tray, notification and background lifecycle", async ({ workspace, page }) => {
  await workspace.go("Pomodoro")
  await page.getByRole("switch", { name: /^Pausas / }).click()
  await page.getByRole("switch", { name: /^Som / }).click()
  await page.getByRole("switch", { name: /^Iniciar o próximo sozinho / }).click()
  await page.getByRole("button", { name: "Iniciar", exact: true }).click()
  await workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)
  await workspace.advance(25 * 60_000)
  await expect.poll(() => workspace.app.evaluate(() => globalThis.e2e.notifications.length)).toBe(1)
  await workspace.app.evaluate(() => globalThis.e2e.notifications[0].emit("click"))
  await expect.poll(() => workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true)
  await expect(page.getByRole("tab", { name: "Pausa curta", exact: true })).toHaveAttribute("aria-selected", "true")
  const state = await page.evaluate(() => window.desktop!.pomodoro!.getState())
  expect(state.today.sessions).toBe(1)
  expect(state.today.focusMinutes).toBe(25)
  expect(state.status).toBe("running")
  await workspace.menu("Pausar")
  await expect(page.getByRole("button", { name: "Retomar", exact: true })).toBeVisible()
  await workspace.menu("Retomar")
  await workspace.menu("Reiniciar timer")
  await expect(page.getByRole("button", { name: "Iniciar", exact: true })).toBeVisible()
  await workspace.go("Tarefas")
  await workspace.menu("Abrir Pomodoro")
  await workspace.ready("Pomodoro")
  await workspace.restart()
  page = workspace.page
  await workspace.go("Pomodoro")
  expect((await page.evaluate(() => window.desktop!.pomodoro!.getState())).today.sessions).toBe(1)
})

for (const weather of ["fallback", "error"] as const) {
  test.describe(`weather ${weather}`, () => {
    test.use({ scenario: { weather } })
    test("pomodoro remains usable when external weather is unavailable", async ({ workspace, page }) => {
      await workspace.go("Pomodoro")
      await expect(page.getByText(weather === "fallback" ? "São Paulo" : "Não foi possível carregar", { exact: true }).first()).toBeVisible()
      await page.getByRole("button", { name: "Iniciar", exact: true }).click()
      await expect(page.getByRole("button", { name: "Pausar", exact: true })).toBeVisible()
    })
  })
}

test("desktop: normal close exits and frees the backend", async ({ workspace }) => {
  await workspace.checkpoint()
  workspace.stopping = true
  const closed = workspace.app.waitForEvent("close")
  const base = await workspace.page.evaluate(() => window.desktop!.getApiBaseUrl())
  await workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {})
  await closed
  await expect.poll(async () => { try { await fetch(`${base}/api/health`); return false } catch { return true } }).toBe(true)
})

test("desktop: second instance reopens the existing window and exits", async ({ workspace, page }) => {
  await workspace.go("Configurações")
  await page.getByRole("switch", { name: "Continuar em segundo plano ao fechar a janela", exact: true }).click()
  await workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)
  const second = spawn(workspace.child.spawnfile, [workspace.launchDir, "--no-sandbox", `--user-data-dir=${workspace.home}/electron`], { env: workspace.env, stdio: "pipe" })
  try {
    const exit = await new Promise<number | null>((resolve, reject) => { second.once("exit", resolve); second.once("error", reject) })
    expect(exit).toBe(0)
    await expect.poll(() => workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true)
    expect(workspace.app.windows()).toHaveLength(1)
  } finally { second.kill() }
})

test("desktop: window bounds persist and the tray Quit action exits", async ({ workspace }) => {
  // Xvfb has no window manager to acknowledge maximize/unmaximize. Start from
  // a normal saved window, then exercise real resize events and persistence.
  await workspace.stop()
  writeFileSync(join(workspace.home, "electron/window-state.json"), JSON.stringify({
    bounds: { x: 100, y: 100, width: 1000, height: 700 }, maximized: false, fullScreen: false,
  }))
  await workspace.start()
  expect(await workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toMatchObject({ width: 1000, height: 700 })
  await workspace.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setBounds({ x: 100, y: 100, width: 900, height: 650 })
  })
  await expect.poll(() => {
    try { return JSON.parse(readFileSync(join(workspace.home, "electron/window-state.json"), "utf8")).bounds }
    catch { return null }
  }).toMatchObject({ width: 900, height: 650 })
  await workspace.restart()
  expect(await workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toMatchObject({ width: 900, height: 650 })
  await workspace.checkpoint()
  workspace.stopping = true
  const closed = workspace.app.waitForEvent("close")
  await workspace.menu("Sair").catch(() => {})
  await closed
})
