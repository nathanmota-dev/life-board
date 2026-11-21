import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { DAY, Workspace, expect } from "../fixtures"
import { Director } from "./director"

// Shared by the demo recordings: realistic sample data and the ffmpeg capture.
// LIFE_BOARD_DEMO_GITHUB_TOKEN connects the real GitHub account; without it the
// GitHub screens show synthetic data.
export const SIZE = { width: 1600, height: 900 }
const token = process.env.LIFE_BOARD_DEMO_GITHUB_TOKEN
const at = (day: number, time = "12:00") => `2026-10-${String(day).padStart(2, "0")}T${time}:00Z`

export async function seed(workspace: Workspace) {
  const task = (data: Record<string, unknown>) => workspace.create("tasks", data)
  const budget = await task({ title: "Revisar o orçamento do mês", status: "today", priority: "high", dueAt: at(21, "18:00"), tags: ["finanças"], color: "yellow" })
  const study = await task({ title: "Estudar Drizzle ORM", status: "today", priority: "medium", tags: ["estudos"], description: "Relações, migrations e queries tipadas" })
  await task({ title: "Trocar o filtro do ar-condicionado", status: "today", tags: ["casa"] })
  await task({ title: "Agendar consulta no dentista", status: "upcoming", dueAt: at(24, "00:00"), tags: ["saúde"], color: "blue" })
  await task({ title: "Planejar a viagem de fim de ano", status: "someday", tags: ["viagem"], pinned: true, color: "green" })
  const run = await task({ title: "Treino longo de 12 km", status: "upcoming", dueAt: at(25, "00:00"), tags: ["saúde"] })
  await task({ title: "Enviar o relatório trimestral", status: "done", tags: ["trabalho"] })
  const groceries = await task({ title: "Lista de mercado", status: "today", tags: ["casa"] })
  for (const [title, status] of [["Café", "done"], ["Frutas", "today"], ["Arroz", "today"]]) await task({ title, status, parentTaskId: groceries.id })
  for (const title of ["Renovar a CNH", "Ligar para o banco sobre o cartão"]) await task({ title })

  await workspace.create("thoughts", { title: "App de receitas com o que tem na geladeira", body: "Fotografar os ingredientes e sugerir receitas simples para a semana.", tags: ["ideias"], pinned: true })
  await workspace.create("thoughts", { title: "Hábitos Atômicos", body: "Pequenas melhorias de 1% ao dia se acumulam. Facilitar o hábito certo e dificultar o errado.", tags: ["livros"] })
  await workspace.create("thoughts", { title: "Retrospectiva do mês", body: "O que funcionou: treinos de manhã. Ajustar: menos reuniões à tarde.", tags: ["reflexão"], linkedTaskIds: [budget.id] })

  const water = await workspace.create("habits", { name: "Beber água", emoji: "💧", target: 2000, step: 250, unit: "ml" })
  const reading = await workspace.create("habits", { name: "Ler", emoji: "📚", target: 20, step: 10, unit: "páginas" })
  const meditation = await workspace.create("habits", { name: "Meditar", emoji: "🧘", target: 1, unit: "sessão" })
  for (let day = 1; day <= 20; day++) {
    const key = `2026-10-${String(day).padStart(2, "0")}`
    if (day % 6) await workspace.create(`habits/${water.id}/logs`, { delta: day % 4 ? 2000 : 1500, day: key })
    if (day % 3) await workspace.create(`habits/${reading.id}/logs`, { delta: 20, day: key })
    if (day % 5 !== 2) await workspace.create(`habits/${meditation.id}/logs`, { delta: 1, day: key })
  }
  await workspace.create(`habits/${water.id}/logs`, { delta: 750, day: DAY })

  await workspace.create("goals", { title: "Correr uma meia maratona", why: "Ter mais disposição no dia a dia", domain: "health", startAt: at(1), targetAt: "2026-12-14T12:00:00Z", linkedTaskIds: [run.id], linkedHabitIds: [water.id], milestones: [{ title: "Correr 5 km sem parar" }, { title: "Correr 10 km" }, { title: "Correr 21 km" }] })
  await workspace.create("goals", { title: "Aprender TypeScript avançado", domain: "learning", startAt: at(5), targetAt: "2026-11-30T12:00:00Z", linkedTaskIds: [study.id], linkedHabitIds: [reading.id], milestones: [{ title: "Generics e tipos condicionais" }, { title: "Projeto com Drizzle" }] })
  await workspace.create("goals", { title: "Montar uma reserva de emergência", domain: "personal", targetAt: "2027-03-01T12:00:00Z", milestones: [{ title: "Guardar 3 meses de gastos" }, { title: "Guardar 6 meses de gastos" }] })

  await workspace.create("projects", { title: "Life Board", description: "Painel pessoal para organizar a rotina", status: "in_progress" })
  await workspace.create("projects", { title: "Blog pessoal", description: "Escrever sobre desenvolvimento e produtividade", status: "planned" })
  await workspace.create("projects", { title: "Reformar o escritório", description: "Mesa nova, iluminação e organização dos cabos", status: "idea" })
  await workspace.create("projects", { title: "Curso de fotografia", description: "Módulos de composição e luz", status: "done" })

  const event = (title: string, day: number, start: string, end: string, location?: string) => workspace.create("calendar/events", { title, startAt: at(day, start), endAt: at(day, end), location })
  await event("Reunião de planejamento", 21, "13:00", "14:00", "Online")
  await event("Academia", 21, "18:30", "19:30")
  await event("Almoço com a família", 22, "12:00", "13:30", "Centro")
  await event("Consulta médica", 23, "09:00", "10:00", "Clínica")
  await event("Revisão de código", 20, "15:00", "16:00", "Online")
  await event("Aula de inglês", 19, "19:00", "20:00")

  for (const [day, score, note] of [[14, 4, "Dia produtivo"], [15, 3, null], [16, 5, "Terminei um projeto"], [17, 4, null], [18, 2, "Noite mal dormida"], [19, 4, "Treino bom"], [20, 5, "Ótimo dia com amigos"]] as const) {
    await workspace.create("mood/entries", { score, note, day: `2026-10-${day}` })
  }

  await workspace.create("github/connect", { token: token ?? "synthetic-token-for-e2e-only" })
  await workspace.create("github/sync", {})
}

export type RecordOptions = {
  /** The MP4 to write. */
  output: string
  /** Also saves the first frame here, for a video poster. */
  poster?: string
  /** The app theme during the recording; the app default when missing. */
  theme?: "light" | "dark"
  /** Extra data on top of `seed`. */
  prepare?: (workspace: Workspace) => Promise<void>
  tour: (workspace: Workspace, director: Director) => Promise<void>
}

export async function record({ output, poster, theme, prepare, tour }: RecordOptions) {
  const workspace = new Workspace(token ? { github: "live" } : {})
  const raw = join(workspace.home, "demo.mkv")
  let recorder: ChildProcess | undefined
  try {
    await workspace.start()
    await seed(workspace)
    await prepare?.(workspace)
    await workspace.stop()
    // Xvfb has no window manager: the saved bounds put the frameless window at
    // the display origin, where ffmpeg captures it. Playwright's recordVideo
    // hangs with Electron, so the display itself is recorded.
    writeFileSync(join(workspace.home, "electron/window-state.json"), JSON.stringify({ bounds: { x: 0, y: 0, ...SIZE }, maximized: false, fullScreen: false }))
    await workspace.start()
    if (theme) {
      // The key ThemeProvider reads (web/src/components/theme-provider.tsx).
      await workspace.page.evaluate(value => window.localStorage.setItem("life-board-theme", value), theme)
      await workspace.page.reload()
      await workspace.ready("Painel")
    }
    const director = new Director(workspace.page)
    await director.install()
    await director.wait(1000)
    recorder = spawn("ffmpeg", [
      "-y", "-loglevel", "error", "-f", "x11grab", "-draw_mouse", "0", "-framerate", "30", "-video_size", `${SIZE.width}x${SIZE.height}`,
      "-i", `${process.env.DISPLAY}+0,0`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", raw,
    ], { stdio: ["pipe", "inherit", "inherit"] })
    await director.wait(500)
    await tour(workspace, director)
    await stopRecorder(recorder)
    mkdirSync(dirname(output), { recursive: true })
    const result = spawnSync("ffmpeg", [
      "-y", "-loglevel", "error", "-ss", "0.5", "-i", raw,
      "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", output,
    ], { stdio: "inherit" })
    expect(result.status, "ffmpeg conversion").toBe(0)
    if (poster) {
      const frame = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", output, "-frames:v", "1", "-q:v", "3", poster], { stdio: "inherit" })
      expect(frame.status, "ffmpeg poster").toBe(0)
    }
  } finally {
    if (recorder) await stopRecorder(recorder)
    await workspace.stop()
    rmSync(workspace.home, { recursive: true, force: true })
  }
}

async function stopRecorder(recorder: ChildProcess) {
  if (recorder.exitCode !== null) return
  const exited = new Promise(done => recorder.once("exit", done))
  // "q" lets ffmpeg finish the file; a signal would leave it truncated.
  recorder.stdin?.end("q")
  await exited
}
