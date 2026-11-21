import { test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Workspace } from "../fixtures"
import { choose } from "../ui"
import type { Director } from "./director"
import { record } from "./recording"

// Records the ~90 s README demo: a paced tour of every screen with realistic data.
// Run with `npm run demo:record`. See recording.ts for the data and the capture.
test("records the Life Board demo", async () => {
  await record({ output: resolve("web/src/public/life-board-demo.mp4"), tour })
})

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

  await director.go(workspace, "Arquivos", "Arquivos: documentos e imagens")
  await director.click(page.getByRole("button", { name: "Nova pasta", exact: true }))
  await director.type(page.getByLabel("Nome", { exact: true }), "Documentos da casa")
  await director.click(page.getByRole("button", { name: "Criar pasta", exact: true }))
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
