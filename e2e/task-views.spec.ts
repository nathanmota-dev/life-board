import { test, expect } from "./fixtures"

test("tasks: today, upcoming and someday filters keep each task in its view", async ({ workspace, page }) => {
  await workspace.create("tasks", { title: "Today filter", status: "today" })
  await workspace.create("tasks", { title: "Upcoming filter", status: "upcoming", dueAt: "2026-10-25T00:00:00Z" })
  await workspace.create("tasks", { title: "Someday filter", status: "someday" })
  await workspace.go("Tarefas")
  for (const [filter, title] of [["Hoje", "Today filter"], ["Próximas", "Upcoming filter"], ["Algum dia", "Someday filter"]]) {
    await page.getByRole("button", { name: filter, exact: true }).click()
    await expect(page.getByRole("article")).toHaveCount(1)
    await expect(page.getByRole("article", { name: title, exact: true })).toBeVisible()
  }
  await page.getByRole("button", { name: "Todos", exact: true }).click()
  const card = page.getByRole("article", { name: "Upcoming filter", exact: true })
  await card.getByRole("button", { name: "Data de vencimento", exact: true }).click()
  await page.getByRole("button", { name: "Limpar data", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect.poll(async () => (await workspace.list<{ title: string; dueAt: string | null }>("tasks")).find(task => task.title === "Upcoming filter")?.dueAt).toBe(null)
})

test("tasks: completed checklist items expand, collapse and reopen", async ({ workspace, page }) => {
  const parent = await workspace.create("tasks", { title: "Completed checklist" })
  for (let i = 0; i < 5; i++) await workspace.create("tasks", { title: `Checked item ${i}`, parentTaskId: parent.id, status: "done" })
  await workspace.go("Tarefas")
  const card = page.getByRole("article", { name: "Completed checklist", exact: true })
  await expect(card.getByRole("checkbox")).toHaveCount(3)
  await card.getByRole("button", { name: "+2 concluídos", exact: true }).click()
  await expect(card.getByRole("checkbox")).toHaveCount(5)
  await card.getByRole("checkbox", { name: "Reabrir Checked item 4", exact: true }).click()
  await expect(card.getByRole("checkbox", { name: "Concluir Checked item 4", exact: true })).toBeVisible()
  await card.getByRole("button", { name: "Mostrar menos", exact: true }).click()
  await expect(card.getByRole("checkbox")).toHaveCount(4)
})
