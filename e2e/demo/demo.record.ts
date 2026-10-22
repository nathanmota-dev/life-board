import { test } from "@playwright/test"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { DAY, Workspace, expect } from "../fixtures"
import { choose } from "../ui"
import { Director } from "./director"

// Records the ~90 s README demo: a paced tour of every screen with realistic data.
// Run with `npm run demo:record`. LIFE_BOARD_DEMO_GITHUB_TOKEN connects the
// real GitHub account; without it the GitHub screens show synthetic data.
const OUTPUT = resolve("web/src/public/life-board-demo.mp4")
const SIZE = { width: 1600, height: 900 }
const token = process.env.LIFE_BOARD_DEMO_GITHUB_TOKEN
const at = (day: number, time = "12:00") => `2026-10-${String(day).padStart(2, "0")}T${time}:00Z`

async function seed(workspace: Workspace) {
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

test("records the Life Board demo", async () => {
  const workspace = new Workspace(token ? { github: "live" } : {})
  const raw = join(workspace.home, "demo.mkv")
  let recorder: ChildProcess | undefined
  try {
    await workspace.start()
    await seed(workspace)
    await workspace.stop()
    // Xvfb has no window manager: the saved bounds put the frameless window at
    // the display origin, where ffmpeg captures it. Playwright's recordVideo
    // hangs with Electron, so the display itself is recorded.
    writeFileSync(join(workspace.home, "electron/window-state.json"), JSON.stringify({ bounds: { x: 0, y: 0, ...SIZE }, maximized: false, fullScreen: false }))
    await workspace.start()
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
    mkdirSync(resolve("web/src/public"), { recursive: true })
    const result = spawnSync("ffmpeg", [
      "-y", "-loglevel", "error", "-ss", "0.5", "-i", raw,
      "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", OUTPUT,
    ], { stdio: "inherit" })
    expect(result.status, "ffmpeg conversion").toBe(0)
  } finally {
    if (recorder) await stopRecorder(recorder)
    await workspace.stop()
    rmSync(workspace.home, { recursive: true, force: true })
  }
})

async function stopRecorder(recorder: ChildProcess) {
  if (recorder.exitCode !== null) return
  const exited = new Promise(done => recorder.once("exit", done))
  // "q" lets ffmpeg finish the file; a signal would leave it truncated.
  recorder.stdin?.end("q")
  await exited
}

// Screens with nothing to do get ~2 s; the ones with flows (projects, tasks,
// dashboard) get most of the budget.
async function tour(workspace: Workspace, director: Director) {
  const { page } = director

  await director.caption("Painel: um resumo do seu dia")
  await director.wait(1500)
  await director.scroll(650)
  await director.click(page.getByRole("button", { name: "Registrar Beber água", exact: true }).first())
  await director.click(page.getByRole("button", { name: /^Escolher foco/ }))
  await director.click(page.getByRole("button", { name: "Adicionar Revisar o orçamento do mês ao foco de hoje", exact: true }))
  await director.click(page.getByRole("button", { name: "Adicionar Estudar Drizzle ORM ao foco de hoje", exact: true }))
  await page.keyboard.press("Escape")
  await director.wait(900)
  await director.scroll(-650)

  await director.go(workspace, "Caixa de entrada", "Caixa de entrada: capture tarefas e ideias")
  const capture = page.getByRole("textbox", { name: "Texto da captura" })
  await director.type(capture, "Pagar a conta de luz amanhã !alta #casa")
  await director.wait(500)
  await director.click(page.getByRole("button", { name: "Capturar", exact: true }))
  await director.click(page.getByRole("tab", { name: "Ideia", exact: true }))
  await director.type(capture, "Podcast sobre hábitos #ideias")
  await capture.press("Enter")
  await director.click(page.getByRole("button", { name: "Organizar", exact: true }))
  await director.wait(500)
  await director.click(page.getByRole("button", { name: "Hoje", exact: false }))
  await director.wait(500)
  await page.keyboard.press("Escape")

  await director.go(workspace, "Atividade", "Atividade: sua linha do tempo")
  await director.wait(700)

  await director.go(workspace, "Etiquetas", "Etiquetas: tudo agrupado por assunto")
  await director.click(page.getByRole("button", { name: /casa/ }).first())
  await director.wait(500)

  await director.go(workspace, "Ideias", "Ideias: anote, fixe e vincule a tarefas")
  await director.click(page.getByRole("button", { name: "Nova ideia", exact: true }))
  await director.type(page.getByLabel("Título", { exact: true }), "Organizar fotos de viagem")
  await director.type(page.getByLabel("Ideia", { exact: true }), "Álbuns por ano e backup.")
  await director.click(page.getByRole("button", { name: "Salvar ideia", exact: true }))
  await director.wait(800)

  await director.go(workspace, "Tarefas", "Tarefas: prioridades, listas e filtros")
  await director.click(page.getByRole("button", { name: "Nova tarefa", exact: true }))
  await director.type(page.getByLabel("Título", { exact: true }), "Preparar a apresentação")
  await choose(page, "Prioridade", "Alta")
  await director.click(page.getByRole("button", { name: "Criar tarefa", exact: true }))
  await director.click(page.getByRole("article", { name: "Lista de mercado" }).getByRole("checkbox", { name: "Concluir Frutas" }))
  await director.click(page.getByRole("article", { name: "Trocar o filtro do ar-condicionado" }).getByRole("button", { name: "Marcar como concluída" }))
  for (const filter of ["Hoje", "Próximas", "Todos"]) await director.click(page.getByRole("button", { name: filter, exact: true }))
  await director.click(page.getByRole("tab", { name: "Lista", exact: true }))
  await director.wait(800)
  await director.click(page.getByRole("tab", { name: "Quadro", exact: true }))

  await director.go(workspace, "Calendário", "Calendário: sua semana de compromissos")
  await director.click(page.getByRole("button", { name: "Novo evento às 17:00", exact: true }).nth(4))
  await director.type(page.getByLabel("Título", { exact: true }), "Corrida no parque")
  await director.click(page.getByRole("button", { name: "Criar evento", exact: true }))
  await director.wait(800)

  await director.go(workspace, "Metas", "Metas: progresso por etapas, tarefas e hábitos")
  await director.click(page.getByRole("button", { name: /Correr uma meia maratona/ }))
  await director.click(page.getByRole("dialog").getByRole("checkbox", { name: "Concluir Correr 5 km sem parar" }))
  await director.wait(700)
  await page.keyboard.press("Escape")
  await director.click(page.getByRole("tab", { name: "Linha do tempo", exact: true }))
  await director.wait(900)

  await director.go(workspace, "Projetos", "Projetos: um quadro kanban da ideia à conclusão")
  await director.click(page.getByRole("button", { name: "Novo projeto", exact: true }).first())
  await director.type(page.getByLabel("Título", { exact: true }), "Horta em casa")
  await director.type(page.getByLabel("Descrição", { exact: true }), "Temperos na varanda")
  await director.click(page.getByRole("button", { name: "Adicionar projeto", exact: true }))
  await director.wait(500)
  await director.drag(page.getByRole("heading", { name: "Horta em casa", exact: true }), page.getByRole("region", { name: "Planejado", exact: true }))
  await director.drag(page.getByRole("heading", { name: "Blog pessoal", exact: true }), page.getByRole("region", { name: "Em andamento", exact: true }))
  await director.wait(900)

  await director.go(workspace, "Hábitos", "Hábitos: metas diárias e histórico")
  await director.click(page.getByRole("button", { name: "Registrar Ler", exact: true }))
  await director.click(page.getByRole("button", { name: "Registrar Meditar", exact: true }))
  await director.scroll(600)
  await director.wait(500)

  await director.go(workspace, "Pomodoro", "Pomodoro: foco com timer e pausas")
  await director.click(page.getByRole("button", { name: "Iniciar", exact: true }))
  await director.wait(1200)

  await director.go(workspace, "GitHub", "GitHub: pull requests e issues")
  await director.wait(600)
  await director.click(page.getByRole("tab", { name: "Issues", exact: true }))
  await director.wait(800)

  await director.go(workspace, "Quadro de arquivos", "Quadro de arquivos: documentos e imagens")
  await director.click(page.getByRole("button", { name: "Novo quadro", exact: true }))
  await director.type(page.getByLabel("Nome", { exact: true }), "Documentos da casa")
  await director.click(page.getByRole("button", { name: "Criar quadro", exact: true }))
  await page.getByLabel("Arquivos para enviar").setInputFiles([
    { name: "life-board.png", mimeType: "image/png", buffer: readFileSync("desktop/resources/icon.png") },
    { name: "contrato-aluguel.txt", mimeType: "text/plain", buffer: Buffer.from("Contrato de aluguel 2026") },
  ])
  await director.wait(1000)

  await director.go(workspace, "Humor", "Humor: como você se sente hoje")
  await director.click(page.getByRole("radio", { name: "Ótimo", exact: true }))
  await director.click(page.getByRole("button", { name: "Salvar humor", exact: true }))
  await director.wait(600)

  await director.go(workspace, "Configurações", "Configurações: tema, cor, idioma e integrações")
  await director.click(page.getByRole("button", { name: "Escuro", exact: true }))
  await director.click(page.getByRole("button", { name: "Usar #8B5CF6", exact: true }))
  await director.wait(400)
  for (const tab of ["GitHub", "Atualizações", "Arquivos"]) {
    await director.click(page.getByRole("tab", { name: tab, exact: true }))
    await director.wait(250)
  }
  await director.go(workspace, "Painel", "Life Board: sua vida em um só lugar")
  await director.wait(1500)
}
