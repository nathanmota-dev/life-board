import { test as base, expect, _electron, request, type APIRequestContext, type ElectronApplication, type Page } from "@playwright/test"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, renameSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { ChildProcess } from "node:child_process"

export { expect }
export const EPOCH = Date.parse("2026-10-21T12:00:00Z")
export const DAY = "2026-10-21"
export type Scenario = { github?: "empty" | "error" | "unauthorized" | "rate-limit"; weather?: "error" | "fallback"; updates?: "available" | "current" | "network" | "hold-download" | "download-error" | "integrity" }
type NativeState = {
  external: string[]
  notifications: { options: { title: string; body: string }; emit: (event: string) => void }[]
  shortcuts: Record<string, () => void>
  menu: { items: { label: string; click: () => void; enabled: boolean }[] }
  relaunch: unknown[]
}
declare global { var e2e: NativeState }

export class Workspace {
  readonly home = mkdtempSync(join(process.env.LIFE_BOARD_E2E_SESSION ?? tmpdir(), "life board e2e "))
  readonly launchDir = join(this.home, "launch")
  readonly logs: string[] = []
  readonly errors: string[] = []
  readonly env: Record<string, string>
  app!: ElectronApplication
  child!: ChildProcess
  appClosed = false
  readonly traces: string[] = []
  private tracing = false
  page!: Page
  api!: APIRequestContext
  stopping = false
  scenario: Scenario
  offset = 0
  needsRefresh = false
  private readonly trackedPages = new WeakSet<Page>()
  constructor(scenario: Scenario) {
    this.scenario = scenario
    for (const directory of [this.launchDir, join(this.home, "resources"), join(this.home, "electron")]) mkdirSync(directory, { recursive: true })
    const metadata = JSON.parse(readFileSync("package.json", "utf8"))
    writeFileSync(join(this.launchDir, "package.json"), JSON.stringify({ name: metadata.name, version: metadata.version, main: resolve("e2e/support/main.cjs") }))
    symlinkSync(resolve("api/drizzle"), join(this.home, "resources/migrations"), "dir")
    writeFileSync(join(this.home, "installed.AppImage"), "synthetic original artifact")
    writeFileSync(join(this.home, "clock"), "0")
    writeFileSync(join(this.home, "calls.jsonl"), "")
    this.setScenario(scenario)
    this.env = Object.fromEntries(Object.entries({
      ...process.env, TZ: "UTC", LIFE_BOARD_E2E_ROOT: resolve("."), LIFE_BOARD_E2E_HOME: this.home,
      LIFE_BOARD_E2E_SCENARIO: join(this.home, "scenario.json"), LIFE_BOARD_E2E_CALLS: join(this.home, "calls.jsonl"),
      LIFE_BOARD_E2E_EPOCH: String(EPOCH), LIFE_BOARD_E2E_CLOCK: join(this.home, "clock"),
      XDG_CONFIG_HOME: join(this.home, "config"), XDG_DATA_HOME: join(this.home, "data"), XDG_CACHE_HOME: join(this.home, "cache"),
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    for (const key of ["ELECTRON_RUN_AS_NODE", "ELECTRON_RENDERER_URL", "APPIMAGE", "SNAP", "FLATPAK_ID"]) delete this.env[key]
  }
  setScenario(patch: Scenario) {
    this.scenario = { ...this.scenario, ...patch }
    writeFileSync(join(this.home, "scenario.tmp"), JSON.stringify(this.scenario))
    renameSync(join(this.home, "scenario.tmp"), join(this.home, "scenario.json"))
  }
  async start(hidden = false) {
    await this.api?.dispose()
    this.stopping = false
    this.appClosed = false
    this.app = await _electron.launch({
      args: [this.launchDir, "--no-sandbox", "--password-store=gnome-libsecret", ...(this.env.LIFE_BOARD_XVFB_ACTIVE === "1" ? ["--ozone-platform=x11"] : []), ...(hidden ? ["--hidden"] : []), `--user-data-dir=${join(this.home, "electron")}`],
      env: this.env, locale: "pt-BR", timezoneId: "UTC", timeout: 30_000,
    })
    this.child = this.app.process()
    this.child.stdout?.on("data", value => this.logs.push(String(value)))
    this.child.stderr?.on("data", value => this.logs.push(String(value)))
    this.app.on("close", () => { this.appClosed = true; if (!this.stopping) this.errors.push("Electron closed unexpectedly") })
    this.app.on("window", page => this.trackPage(page))
    this.app.context().setDefaultTimeout(10_000)
    await this.app.context().tracing.start({ screenshots: true, snapshots: true, sources: true })
    this.tracing = true
    await this.app.context().route(/^https?:\/\/(?!127\.0\.0\.1[:/]|localhost[:/])/, async route => {
      const url = route.request().url()
      if (url.includes("ipwho.is") || url.includes("ipapi.co")) {
        return route.fulfill({ json: this.scenario.weather === "fallback" ? { success: false } : { city: "Synthetic City", region: "Test", country_code: "BR", latitude: -23.55, longitude: -46.63 } })
      }
      if (url.includes("api.open-meteo.com")) {
        if (this.scenario.weather === "error") return route.fulfill({ status: 503, body: "Synthetic weather failure" })
        return route.fulfill({ json: {
          current: { time: `${DAY}T12:00`, temperature_2m: 24, apparent_temperature: 25, relative_humidity_2m: 60, wind_speed_10m: 8, weather_code: 0, is_day: 1 },
          hourly: { time: [`${DAY}T12:00`, `${DAY}T13:00`], temperature_2m: [24, 25], weather_code: [0, 1] },
          daily: { temperature_2m_max: [28], temperature_2m_min: [18], sunrise: [`${DAY}T06:00`], sunset: [`${DAY}T18:00`], precipitation_probability_max: [10], uv_index_max: [5] },
        } })
      }
      // Avatars are optional images. Every other external request is a test failure.
      if (url.includes("avatars.githubusercontent.com")) return route.fulfill({ status: 404, body: "" })
      this.errors.push(`Unexpected external renderer request: ${url}`)
      return route.abort()
    })
    await this.app.context().addInitScript(({ epoch }) => {
      if ("e2eAdvance" in window) return
      const RealDate = Date
      const origin = RealDate.now()
      let offset = 0
      Object.defineProperty(window, "e2eAdvance", { value: (value: number) => { offset += value } })
      const now = () => epoch + RealDate.now() - origin + offset
      window.Date = new Proxy(RealDate, {
        construct: (target, args) => Reflect.construct(target, args.length ? args : [now()]),
        get: (target, key) => key === "now" ? now : Reflect.get(target, key),
      })
    }, { epoch: EPOCH + this.offset })
    expect(await this.app.evaluate(({ app }) => app.getPath("userData"))).toBe(join(this.home, "electron"))
    if (this.env.LIFE_BOARD_XVFB_ACTIVE === "1") {
      expect(await this.app.evaluate(() => process.env.DISPLAY)).toBe(this.env.DISPLAY)
      expect(await this.app.evaluate(({ app }) => app.commandLine.getSwitchValue("ozone-platform"))).toBe("x11")
    }
    if (hidden) {
      expect(this.app.windows()).toHaveLength(0)
      await this.app.evaluate(({ app }) => app.emit("activate"))
    }
    this.page = await this.app.firstWindow()
    this.trackPage(this.page)
    const url = await this.page.evaluate(() => window.desktop!.getApiBaseUrl())
    this.api = await request.newContext({ baseURL: `${url}/api/` })
    await expect.poll(async () => (await this.api.get("health")).ok()).toBe(true)
    await this.page.waitForLoadState("load")
    await this.ready(await this.page.evaluate(() => document.documentElement.lang.startsWith("pt") ? "Painel" : "Dashboard"))
    await this.page.reload()
    await this.ready(await this.page.evaluate(() => document.documentElement.lang.startsWith("pt") ? "Painel" : "Dashboard"))
  }
  async ready(title: string) {
    await expect(this.page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible()
    await expect(this.page.getByLabel("Carregando", { exact: true })).toHaveCount(0)
  }
  private trackPage(page: Page) {
    if (this.trackedPages.has(page)) return
    this.trackedPages.add(page)
    page.on("pageerror", error => this.errors.push(error.message))
    page.on("crash", () => this.errors.push("Renderer crashed"))
    page.on("console", message => { if (message.type() === "error") this.logs.push(`[renderer] ${message.text()}\n`) })
  }
  async go(title: string) {
    // API calls set up preconditions outside React Query. Reload once after a
    // batch of seeds so its existing dashboard queries don't retain empty data.
    if (this.needsRefresh) { await this.page.reload(); this.needsRefresh = false }
    const link = this.page.locator('[data-sidebar="sidebar"]').getByRole("link", { name: title, exact: true })
    await expect(async () => {
      const trigger = this.page.locator('[data-sidebar="trigger"]:visible').first()
      if (!await link.isVisible() && await trigger.isVisible()) await trigger.click({ timeout: 500 })
      await link.click({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })
    await this.ready(title)
  }
  async create<T = { id: string }>(path: string, data: unknown): Promise<T> {
    const response = await this.api.post(path, { data })
    expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
    this.needsRefresh = true
    return response.json()
  }
  async list<T = { id: string; title: string }>(path: string): Promise<T[]> {
    const response = await this.api.get(path)
    expect(response.ok()).toBe(true)
    return (await response.json()).items
  }
  async populate() {
    const task = await this.create("tasks", { title: "Seed task", status: "today", priority: "high", dueAt: `${DAY}T15:00:00Z`, tags: ["seed"] })
    await this.create("tasks", { title: "Seed inbox task" })
    await this.create("thoughts", { title: "Seed thought", body: "A synthetic thought", tags: ["seed"], linkedTaskIds: [task.id] })
    await this.create("habits", { name: "Seed water", target: 6, step: 1, unit: "glasses", emoji: "💧" })
    await this.create("goals", { title: "Seed goal", linkedTaskIds: [task.id], targetAt: "2026-11-21T12:00:00Z", milestones: [{ title: "Seed milestone" }] })
    await this.create("projects", { title: "Seed project", description: "Synthetic project", status: "in_progress" })
    await this.create("calendar/events", { title: "Seed event", startAt: `${DAY}T14:00:00Z`, endAt: `${DAY}T15:00:00Z` })
    await this.create("mood/entries", { score: 4, note: "Seed mood", day: DAY })
    await this.create("file-boards", { name: "Seed board" })
    await this.create("github/connect", { token: "synthetic-token-for-e2e-only" })
    await this.create("github/sync", {})
    await this.page.reload()
    await this.ready("Painel")
    this.needsRefresh = false
  }
  async fault(path: string, method = "GET", pending = false) {
    const pattern = new RegExp(`/api/${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?|$)`)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const handler: Parameters<ReturnType<ElectronApplication["context"]>["route"]>[1] = async route => {
      if (route.request().method() !== method) return route.fallback()
      if (pending) { await gate; return route.continue() }
      return route.fulfill({ status: 503, json: { error: "synthetic_failure", message: "Synthetic transport failure" } })
    }
    await this.app.context().route(pattern, handler)
    return async () => { release(); await this.app.context().unroute(pattern, handler) }
  }
  async advance(ms: number) {
    this.offset += ms
    writeFileSync(join(this.home, "clock.tmp"), String(this.offset))
    renameSync(join(this.home, "clock.tmp"), join(this.home, "clock"))
    for (const page of this.app.windows()) await page.evaluate(value => (window as unknown as { e2eAdvance: (ms: number) => void }).e2eAdvance(value), ms)
    await this.app.evaluate(({ powerMonitor }) => powerMonitor.emit("resume"))
  }
  async menu(label: string) {
    await this.app.evaluate((_electron, label) => {
      const item = globalThis.e2e.menu.items.find(item => item.label === label)
      if (!item || !item.enabled) throw new Error(`Missing tray action: ${label}`)
      item.click()
    }, label)
  }
  async stop() {
    this.stopping = true
    await this.api?.dispose()
    await this.checkpoint()
    if (this.app && !this.appClosed && this.child.exitCode === null) await this.app.close()
  }
  async checkpoint() {
    if (!this.tracing || this.appClosed) return
    const path = join(this.home, `trace-${this.traces.length + 1}.zip`)
    await this.app.context().tracing.stop({ path })
    this.tracing = false
    this.traces.push(path)
  }
  async restart(hidden = false) { await this.stop(); await this.start(hidden) }
}

export const test = base.extend<{ workspace: Workspace; populated: boolean; scenario: Scenario }>({
  populated: [false, { option: true }],
  scenario: [{}, { option: true }],
  workspace: async ({ populated, scenario }, use, info) => {
    const workspace = new Workspace(scenario)
    let completed = false
    try {
      await workspace.start()
      if (populated) await workspace.populate()
      await use(workspace)
      expect(workspace.errors, "Unexpected renderer errors").toEqual([])
      const calls = readFileSync(join(workspace.home, "calls.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
      expect(calls.filter(call => call.kind === "unexpected"), "Unexpected backend requests").toEqual([])
      completed = true
    } finally {
      const failed = !completed || info.status !== info.expectedStatus || workspace.errors.length > 0
      try {
        if (failed && workspace.page && !workspace.page.isClosed()) await info.attach("screenshot", { body: await workspace.page.screenshot(), contentType: "image/png" })
        if (workspace.app) await workspace.checkpoint()
        if (failed) {
          for (const [index, path] of workspace.traces.entries()) await info.attach(`trace-${index + 1}`, { path, contentType: "application/zip" })
          await info.attach("app.log", { body: workspace.logs.join("") + workspace.errors.join("\n"), contentType: "text/plain" })
          await info.attach("calls.jsonl", { body: readFileSync(join(workspace.home, "calls.jsonl")), contentType: "application/jsonl" })
        }
      } finally {
        try { await workspace.stop() }
        finally { rmSync(workspace.home, { recursive: true, force: true }) }
      }
    }
  },
  page: async ({ workspace }, use) => use(workspace.page),
})
