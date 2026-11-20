import { test, expect } from "./fixtures"
import { drag } from "./ui"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Locator, Page } from "@playwright/test"

type Stored = { id: string; title: string; kind: "folder" | "page"; parentId: string | null }

const TABLE = "| item | qty |\n|---|---|\n| milk | 1 |\n"

const row = (page: Page, title: string) => page.getByRole("treeitem", { name: title, exact: true })

/** Types a title into the inline input of the tree and confirms it. */
async function create(page: Page, button: string, label: string, title: string) {
  await page.getByRole("button", { name: button, exact: true }).click()
  const input = page.getByRole("textbox", { name: label, exact: true })
  await expect(input).toBeFocused()
  await input.fill(title)
  await input.press("Enter")
}

async function actions(page: Page, title: string, item: string) {
  await row(page, title).hover()
  await page.getByRole("button", { name: `Ações de ${title}`, exact: true }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
}

const treeArea = (page: Page): Locator => page.getByRole("tree").locator("..")

test("pages: build a tree, write a page, restart, rename and move it", async ({ workspace, page }) => {
  const pages = () => workspace.list<Stored>("pages")
  const pageFile = (id: string) => join(workspace.home, "electron/pages", `${id}.md`)
  await workspace.go("Páginas")
  await expect(page.getByText("Selecione ou crie uma página", { exact: true })).toBeVisible()

  await create(page, "Nova pasta", "Nome da nova pasta", "VBL")
  await expect(row(page, "VBL")).toBeVisible()
  // New items go inside the selected folder.
  await row(page, "VBL").click()
  await create(page, "Nova pasta", "Nome da nova pasta", "AKYOU")
  await expect(row(page, "AKYOU")).toBeVisible()
  await row(page, "AKYOU").click()
  await create(page, "Nova página", "Título da nova página", "MindShef - Task")

  // A new page opens ready to be written.
  const editor = page.getByRole("textbox", { name: "Conteúdo de MindShef - Task", exact: true })
  await expect(editor).toHaveAttribute("contenteditable", "true")
  await editor.click()
  await editor.pressSequentially("- first item")
  await editor.press("Enter")
  await editor.pressSequentially("second item")
  await page.getByRole("button", { name: "Concluir", exact: true }).click()

  await expect(page.getByRole("listitem").filter({ hasText: "second item" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Conteúdo de MindShef - Task", exact: true })).toHaveCount(0)
  await expect(page.getByRole("navigation", { name: "Localização da página", exact: true })).toHaveText(/VBL\s*\/\s*AKYOU\s*\/\s*MindShef - Task/)
  const task = (await pages()).find(item => item.title === "MindShef - Task")!
  await expect.poll(() => (existsSync(pageFile(task.id)) ? readFileSync(pageFile(task.id), "utf8") : "")).toBe("- first item\n- second item")

  await workspace.restart()
  page = workspace.page
  await workspace.go("Páginas")
  await expect(row(page, "MindShef - Task")).toBeVisible()
  await expect(row(page, "AKYOU")).toHaveAttribute("aria-expanded", "true")
  await row(page, "MindShef - Task").click()
  await expect(page.getByRole("listitem").filter({ hasText: "first item" })).toBeVisible()

  await row(page, "MindShef - Task").press("F2")
  await page.getByRole("textbox", { name: "Renomear MindShef - Task", exact: true }).fill("MindShef - Done")
  await page.keyboard.press("Enter")
  await expect(row(page, "MindShef - Done")).toBeVisible()
  await expect.poll(async () => (await pages()).find(item => item.id === task.id)?.title).toBe("MindShef - Done")

  await drag(page, row(page, "MindShef - Done"), treeArea(page))
  await expect.poll(async () => (await pages()).find(item => item.id === task.id)?.parentId).toBeNull()

  await actions(page, "MindShef - Done", "Mover para…")
  const dialog = page.getByRole("dialog", { name: "Mover MindShef - Done", exact: true })
  await expect(dialog.getByRole("button", { name: "Nível principal", exact: true })).toBeDisabled()
  await dialog.getByRole("button", { name: "AKYOU", exact: true }).click()
  const akyou = (await pages()).find(item => item.title === "AKYOU")!
  await expect.poll(async () => (await pages()).find(item => item.id === task.id)?.parentId).toBe(akyou.id)
  await expect(row(page, "MindShef - Done")).toBeVisible()
})

test("pages: import a folder of notes and skip what isn't markdown", async ({ workspace, page }) => {
  const source = mkdtempSync(join(tmpdir(), "life board notes "))
  const notes = join(source, "Notes")
  mkdirSync(join(notes, "Sub"), { recursive: true })
  writeFileSync(join(notes, "Top.md"), "# Top\n")
  writeFileSync(join(notes, "Sub", "Deep.markdown"), "# Deep\n")
  writeFileSync(join(notes, "Sub", "pic.png"), Buffer.from([137, 80, 78, 71]))
  await workspace.go("Páginas")

  await page.getByLabel("Pasta para importar", { exact: true }).setInputFiles(notes)

  await expect(page.getByText("2 importadas, 1 ignoradas", { exact: true })).toBeVisible()
  const stored = await workspace.list<Stored>("pages")
  const byTitle = (title: string) => stored.find(item => item.title === title)!
  expect(stored.map(item => item.title).sort()).toEqual(["Deep", "Notes", "Sub", "Top"])
  expect(byTitle("Notes").parentId).toBeNull()
  expect(byTitle("Top").parentId).toBe(byTitle("Notes").id)
  expect(byTitle("Sub").parentId).toBe(byTitle("Notes").id)
  expect(byTitle("Deep").parentId).toBe(byTitle("Sub").id)
})

test("pages: a table renders, and editing it opens the markdown source with a notice", async ({ workspace, page }) => {
  const { id } = await workspace.create("pages", { kind: "page", title: "Table", content: TABLE })
  await workspace.go("Páginas")

  await row(page, "Table").click()
  await expect(page.getByRole("table").getByRole("cell", { name: "milk", exact: true })).toBeVisible()
  await expect(page.getByRole("textbox")).toHaveCount(0)

  await page.getByRole("button", { name: "Editar", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Conteúdo de Table", exact: true })).toHaveValue(TABLE)
  await expect(page.getByRole("status").filter({ hasText: "abriu como markdown" })).toBeVisible()
  await page.getByRole("button", { name: "Concluir", exact: true }).click()
  expect(await workspace.api.get(`pages/${id}/content`).then(response => response.json())).toMatchObject({ content: TABLE })
})

test("pages: deleting a folder asks first, counts its pages and removes their files", async ({ workspace, page }) => {
  const pageFile = (id: string) => join(workspace.home, "electron/pages", `${id}.md`)
  const vbl = await workspace.create<{ id: string }>("pages", { kind: "folder", title: "VBL" })
  const akyou = await workspace.create<{ id: string }>("pages", { kind: "folder", title: "AKYOU", parentId: vbl.id })
  const one = await workspace.create<{ id: string }>("pages", { kind: "page", title: "One", parentId: vbl.id, content: "one" })
  const two = await workspace.create<{ id: string }>("pages", { kind: "page", title: "Two", parentId: akyou.id, content: "two" })
  expect(existsSync(pageFile(one.id)) && existsSync(pageFile(two.id))).toBe(true)
  await workspace.go("Páginas")

  await actions(page, "VBL", "Excluir")
  const dialog = page.getByRole("dialog", { name: "Excluir VBL?", exact: true })
  await expect(dialog).toContainText("as 2 páginas dentro dela")
  await dialog.getByRole("button", { name: "Excluir", exact: true }).click()

  await expect(page.getByText("Nenhuma página ainda", { exact: true })).toBeVisible()
  await expect.poll(() => workspace.list("pages")).toEqual([])
  expect(existsSync(pageFile(one.id)) || existsSync(pageFile(two.id))).toBe(false)
})
