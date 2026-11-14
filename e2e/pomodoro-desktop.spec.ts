import { test, expect, type Workspace } from "./fixtures"
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

async function keepInBackground(workspace: Workspace) {
  await workspace.go("Configurações")
  await workspace.page.getByRole("switch", { name: "Continuar em segundo plano ao fechar a janela", exact: true }).click()
}

test("desktop: second instance recreates the destroyed window and exits", async ({ workspace }) => {
  await keepInBackground(workspace)
  await workspace.closeToTray()
  const second = spawn(workspace.child.spawnfile, [workspace.launchDir, "--no-sandbox", `--user-data-dir=${workspace.home}/electron`], { env: workspace.env, stdio: "pipe" })
  try {
    await workspace.reopen(async () => {
      expect(await new Promise<number | null>((resolve, reject) => { second.once("exit", resolve); second.once("error", reject) })).toBe(0)
    })
    await workspace.ready("Painel")
    expect(await workspace.windowCount()).toBe(1)
  } finally { second.kill() }
})

test("desktop: closing to the tray frees the renderer and reopening shows current data", async ({ workspace }) => {
  // Without a window manager a maximized window never reports new normal bounds.
  await workspace.stop()
  writeFileSync(join(workspace.home, "electron/window-state.json"), JSON.stringify({
    bounds: { x: 100, y: 100, width: 1000, height: 700 }, maximized: false, fullScreen: false,
  }))
  await workspace.start()
  await keepInBackground(workspace)
  await workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 120, y: 90, width: 920, height: 640 }))
  await workspace.closeToTray()
  await expect.poll(() => workspace.rendererCount()).toBe(0)
  expect((await workspace.api.get("health")).ok()).toBe(true)
  await workspace.create("tasks", { title: "Created from the tray", status: "today" })
  await workspace.reopen(() => workspace.menu("Abrir Life Board"))
  await workspace.ready("Painel")
  expect(await workspace.windowCount()).toBe(1)
  expect(await workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toMatchObject({ width: 920, height: 640 })
  await workspace.go("Tarefas")
  await expect(workspace.page.getByText("Created from the tray", { exact: true })).toBeVisible()
})

test("desktop: a notification recreates the destroyed window on its route with current state", async ({ workspace }) => {
  await keepInBackground(workspace)
  await workspace.closeToTray()
  await workspace.menu("Iniciar")
  await workspace.advance(25 * 60_000)
  await expect.poll(() => workspace.app.evaluate(() => globalThis.e2e.notifications.length)).toBe(1)
  await workspace.reopen(() => workspace.app.evaluate(() => globalThis.e2e.notifications[0].emit("click")))
  await workspace.ready("Pomodoro")
  expect(await workspace.windowCount()).toBe(1)
  expect((await workspace.page.evaluate(() => window.desktop!.pomodoro!.getState())).today.sessions).toBe(1)
})

test("desktop: ten tray cycles keep one window and leave no renderer behind", async ({ workspace }) => {
  await keepInBackground(workspace)
  await workspace.closeToTray()
  for (let cycle = 0; cycle < 10; cycle++) {
    await workspace.reopen(() => workspace.app.evaluate(({ app }) => { app.emit("activate"); app.emit("activate") }))
    await workspace.ready("Painel")
    expect(await workspace.windowCount()).toBe(1)
    await workspace.closeToTray()
    await expect.poll(() => workspace.rendererCount()).toBe(0)
  }
})

test("desktop: the tray keeps a software-composited GPU process and reopens normally", async ({ workspace }) => {
  // Xvfb has no GPU, so compositing runs in software and there is no GPU memory to release.
  // Ending the GPU process with real acceleration is covered by gpu-release.test.ts.
  const gpuPid = () => workspace.app.evaluate(({ app }) => app.getAppMetrics().find((metric) => metric.type === "GPU")?.pid)
  expect(await workspace.app.evaluate(({ app }) => app.getGPUFeatureStatus().gpu_compositing)).toBe("disabled_software")
  await keepInBackground(workspace)
  const before = await gpuPid()
  await workspace.closeToTray()
  // Past the 10 s release delay.
  await new Promise((resolve) => setTimeout(resolve, 12_000))
  expect(await gpuPid()).toBe(before)
  await workspace.reopen(() => workspace.menu("Abrir Life Board"))
  await workspace.ready("Painel")
  expect(await workspace.windowCount()).toBe(1)
})

test("desktop: closing while the interface loads keeps the app in the tray", async ({ workspace }) => {
  await keepInBackground(workspace)
  await workspace.closeToTray()
  await workspace.app.evaluate(({ app, BrowserWindow }) => { app.emit("activate"); BrowserWindow.getAllWindows()[0].close() })
  await expect.poll(() => workspace.windowCount()).toBe(0)
  await workspace.reopen(() => workspace.menu("Abrir Life Board"))
  await workspace.ready("Painel")
})

test("desktop: closing during a pomodoro keeps the renderer so the chime plays", async ({ workspace, page }) => {
  await workspace.go("Pomodoro")
  await page.evaluate(() => {
    const create = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function () {
      document.documentElement.dataset.chimeNotes = String(Number(document.documentElement.dataset.chimeNotes ?? 0) + 1)
      return create.call(this)
    }
  })
  await page.getByRole("button", { name: "Iniciar", exact: true }).click()
  await workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => workspace.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)
  expect(await workspace.rendererCount()).toBe(1)
  await workspace.advance(25 * 60_000)
  await expect(page.locator("html")).toHaveAttribute("data-chime-notes", "2")
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
