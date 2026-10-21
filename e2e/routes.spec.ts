import { test, expect } from "./fixtures"

export const routes = [
  ["Painel", "dashboard"], ["Caixa de entrada", "inbox"], ["Atividade", "activity"], ["Etiquetas", "tags"],
  ["Ideias", "thoughts"], ["Tarefas", "tasks"], ["Calendário", "calendar"], ["Metas", "goals"],
  ["Projetos", "projects"], ["Hábitos", "habits"], ["Pomodoro", "pomodoro"], ["GitHub", "github"],
  ["Quadro de arquivos", "file-board"], ["Humor", "mood"], ["Configurações", "settings"],
] as const

const content: Record<string, [string, string]> = {
  dashboard: ["Nenhum evento hoje", "Seed event"], inbox: ["Caixa de entrada vazia", "Seed inbox task"],
  activity: ["Nada por aqui ainda", "Seed thought"], tags: ["Nenhuma etiqueta ainda", "Seed thought"],
  thoughts: ["Nenhuma ideia ainda", "Seed thought"], tasks: ["Nada por aqui", "Seed task"],
  calendar: ["Novo evento", "Seed event"], goals: ["Nenhuma meta por aqui", "Seed goal"],
  projects: ["Nenhum projeto ainda", "Seed project"], habits: ["Nenhum hábito ainda", "Seed water"],
  github: ["Conecte sua conta do GitHub", "Synthetic pull request"],
  "file-board": ["Nenhum quadro ainda", "Seed board"], mood: ["Nenhum registro ainda", "Seed mood"],
  settings: ["Aparência", "Aparência"],
}

for (const populated of [false, true]) {
  test.describe(populated ? "populated workspace" : "empty workspace", () => {
    test.use({ populated })
    for (const [title, path] of routes) {
      test(`${title}: navigation and reload`, async ({ workspace, page }) => {
        const sidebar = page.locator('[data-sidebar="sidebar"]')
        const links = await sidebar.getByRole("link").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")!.split("#").at(-1)!.replace(/\/$/, "")))
        expect(links.sort()).toEqual(routes.map(([, path]) => `/${path}`).sort())
        await workspace.go(title)
        await expect(page).toHaveURL(new RegExp(`#/${path}/?$`))
        await expect(sidebar.locator('a[aria-current="page"]')).toHaveAccessibleName(title)
        await expect(page.getByRole("navigation", { name: "Caminho da página" })).toContainText(title)
        if (path === "pomodoro") await expect(page.getByRole("timer")).toBeVisible()
        else await expect(page.getByText(content[path][Number(populated)], { exact: true }).first()).toBeVisible()
        await page.reload()
        await workspace.ready(title)
        await expect(page.getByText("Não foi possível carregar", { exact: true })).toHaveCount(0)
        if (path === "pomodoro") await expect(page.getByRole("timer")).toBeVisible()
        else await expect(page.getByText(content[path][Number(populated)], { exact: true }).first()).toBeVisible()
      })
    }
  })
}
