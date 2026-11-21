import { test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, type Workspace } from "../fixtures"
import type { Director } from "./director"
import { record } from "./recording"

// Records the short landing page video (landing/): the main features only, in
// the dark theme, starting and ending on the dashboard so it loops smoothly.
// Run with `npm run demo:record:landing`. See recording.ts for the data and the capture.
const STUDY_PLAN = [
  "# Plano de estudos",
  "",
  "Meta: **TypeScript avançado** até o fim de novembro.",
  "",
  "## Esta semana",
  "",
  "- [x] Generics e tipos condicionais",
  "- [ ] Revisar mapped types",
].join("\n")

test("records the landing page video", async () => {
  await record({
    output: resolve("landing/assets/life-board-demo.mp4"),
    poster: resolve("landing/assets/life-board-demo-poster.jpg"),
    theme: "dark",
    prepare,
    tour,
  })
})

async function prepare(workspace: Workspace) {
  // A colorful week next to the default blue events of seed().
  const event = (title: string, day: number, start: string, end: string, color: string) =>
    workspace.create("calendar/events", { title, startAt: `2026-10-${day}T${start}:00Z`, endAt: `2026-10-${day}T${end}:00Z`, color })
  await event("Corrida no parque", 22, "07:00", "08:00", "#10B981")
  await event("Dentista", 20, "10:00", "11:00", "#F43F5E")
  await event("Estudar TypeScript", 23, "17:00", "18:30", "#8B5CF6")
  await event("Feira", 24, "09:00", "10:00", "#F59E0B")
  await event("Jantar com amigos", 24, "19:30", "21:00", "#FF892B")
  await event("Treino funcional", 19, "07:00", "08:00", "#10B981")

  const work = await workspace.create("pages", { kind: "folder", title: "Trabalho" })
  await workspace.create("pages", { kind: "page", title: "Reunião de planejamento", parentId: work.id, content: "# Reunião de planejamento\n\n- Prioridades do trimestre\n" })
  await workspace.create("pages", { kind: "page", title: "Plano de estudos", content: STUDY_PLAN })

  const board = await workspace.create("file-boards", { name: "Casa" })
  const upload = async (name: string, mimeType: string, buffer: Buffer) => {
    const response = await workspace.api.post(`file-boards/${board.id}/items`, { multipart: { file: { name, mimeType, buffer }, title: name } })
    expect(response.ok(), `upload ${name}: ${await response.text()}`).toBe(true)
  }
  await upload("lista-de-compras.txt", "text/plain", Buffer.from("Lista de compras\n\n- Café\n- Frutas\n- Arroz"))
  await upload("life-board.png", "image/png", readFileSync("desktop/resources/icon.png"))
  await upload("contrato-aluguel.txt", "text/plain", Buffer.from("Contrato de aluguel 2026\n\nVencimento todo dia 10."))
}

// About 35 s: a beat per feature, with the flows people care about most.
async function tour(workspace: Workspace, director: Director) {
  const { page } = director

  await director.caption("Seu dia em um só painel")
  await director.wait(1400)
  await director.click(page.getByRole("button", { name: "Registrar Beber água", exact: true }).first())
  await director.wait(700)

  await director.go(workspace, "Tarefas", "Tarefas com prazo, prioridade e etiquetas")
  await director.click(page.getByRole("article", { name: "Trocar o filtro do ar-condicionado" }).getByRole("button", { name: "Marcar como concluída" }))
  await director.click(page.getByRole("button", { name: "Hoje", exact: true }))
  await director.wait(800)

  await director.go(workspace, "Calendário", "Sua semana, sincronizada com o Google Agenda")
  await director.wait(2400)

  await director.go(workspace, "Metas", "Metas divididas em etapas")
  await director.click(page.getByRole("button", { name: /Correr uma meia maratona/ }))
  await director.click(page.getByRole("dialog").getByRole("checkbox", { name: "Concluir Correr 5 km sem parar" }))
  await director.wait(900)
  await page.keyboard.press("Escape")

  await director.go(workspace, "Hábitos", "Hábitos com meta diária e histórico")
  await director.click(page.getByRole("button", { name: "Registrar Ler", exact: true }))
  await director.wait(700)

  await director.go(workspace, "Páginas", "Páginas em Markdown, organizadas em pastas")
  await director.click(page.getByRole("treeitem", { name: "Plano de estudos", exact: true }))
  await director.wait(900)
  await director.click(page.getByRole("button", { name: "Editar", exact: true }))
  const editor = page.getByRole("textbox", { name: "Conteúdo de Plano de estudos", exact: true })
  // The editor keeps an empty paragraph after a list: continue the list from its last item instead.
  await director.click(editor.getByText("Revisar mapped types", { exact: true }))
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  await page.keyboard.type("Praticar com um projeto real", { delay: 30 })
  await director.wait(400)
  await director.click(page.getByRole("button", { name: "Concluir", exact: true }))
  await director.wait(700)

  await director.go(workspace, "Arquivos", "Arquivos com pré-visualização e edição")
  await director.click(page.getByRole("button", { name: /^Casa/ }))
  await director.click(page.getByRole("button", { name: "Abrir lista-de-compras.txt", exact: true }))
  const text = page.getByRole("textbox", { name: "Conteúdo de lista-de-compras.txt", exact: true })
  await director.click(text)
  await text.press("Control+End")
  await text.pressSequentially("\n- Pão", { delay: 40 })
  await director.click(page.getByRole("button", { name: "Salvar", exact: true }))
  await director.wait(700)
  await director.click(page.getByRole("button", { name: "Voltar", exact: true }))
  await director.click(page.getByRole("button", { name: "Abrir life-board.png", exact: true }))
  await director.wait(1100)
  await page.keyboard.press("Escape")
  await director.wait(300)

  await director.go(workspace, "Painel", "Life Board: sua vida em um só lugar")
  await director.wait(1800)
}
