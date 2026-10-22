import { test, expect } from "./fixtures"
import type { Habit } from "../web/src/types/habit"

const reads = [
  ["Painel", "habits"], ["Caixa de entrada", "tasks"], ["Atividade", "thoughts"], ["Etiquetas", "tasks"],
  ["Ideias", "thoughts"], ["Tarefas", "tasks"], ["Calendário", "calendar/events"], ["Metas", "goals"],
  ["Projetos", "projects"], ["Hábitos", "habits"], ["GitHub", "github/status"], ["Quadro de arquivos", "file-boards"], ["Humor", "mood/today"],
] as const

for (const [title, endpoint] of reads) {
  test(`${title}: failed load is visible and recovers after reload`, async ({ workspace, page }) => {
    const restore = await workspace.fault(endpoint)
    await workspace.go(title)
    await page.reload()
    await expect(page.getByText("Não foi possível carregar", { exact: true }).first()).toBeVisible()
    await restore()
    await page.reload()
    await workspace.ready(title)
    await expect(page.getByText("Não foi possível carregar", { exact: true })).toHaveCount(0)
  })
}

test("pending load: loader resolves into real API content", async ({ workspace, page }) => {
  await workspace.create("tasks", { title: "Slow task" })
  await workspace.go("Tarefas")
  const release = await workspace.fault("tasks", "GET", true)
  try {
    await page.reload()
    await expect(page.getByLabel("Carregando", { exact: true })).toBeVisible()
  } finally { await release() }
  await expect(page.getByRole("article", { name: "Slow task", exact: true })).toBeVisible()
})

test("failed task creation keeps the draft and can be retried", async ({ workspace, page }) => {
  await workspace.go("Tarefas")
  const restore = await workspace.fault("tasks", "POST")
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click()
  await page.getByRole("textbox", { name: "Título", exact: true }).fill("Recoverable draft")
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click()
  await expect(page.getByText("Synthetic transport failure", { exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Título", exact: true })).toHaveValue("Recoverable draft")
  expect(await workspace.list("tasks")).toHaveLength(0)
  await restore()
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click()
  await expect(page.getByRole("article", { name: "Recoverable draft", exact: true })).toBeVisible()
  expect(await workspace.list("tasks")).toHaveLength(1)
})

test("failed habit check-in preserves progress and allows another attempt", async ({ workspace, page }) => {
  const habit = await workspace.create("habits", { name: "Recoverable habit", target: 2 })
  await workspace.go("Hábitos")
  const restore = await workspace.fault(`habits/${habit.id}/logs`, "POST")
  await page.getByRole("button", { name: "Registrar Recoverable habit", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Synthetic transport failure")
  expect((await workspace.list<Habit>("habits"))[0].todayCount).toBe(0)
  await restore()
  await page.getByRole("button", { name: "Registrar Recoverable habit", exact: true }).click()
  await expect.poll(async () => (await workspace.list<Habit>("habits"))[0].todayCount).toBe(1)
})
