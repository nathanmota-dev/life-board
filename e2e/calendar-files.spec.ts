import { test, expect, DAY } from "./fixtures"
import { choose } from "./ui"
import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

type StoredEvent = { id: string; title: string; startAt: string; endAt: string; allDay: boolean; location: string | null; color: string }

test("calendar: create, edit, delete and undo from the event details", async ({ workspace, page }) => {
  const events = () => workspace.list<StoredEvent>("calendar/events")
  await workspace.go("Calendário")
  await page.getByRole("button", { name: "Novo evento", exact: true }).click()
  const details = page.getByRole("dialog", { name: "Detalhes do evento", exact: true })
  const title = details.getByRole("textbox", { name: "Título", exact: true })
  await expect(title).toBeFocused()
  await page.keyboard.type("Dentist")
  await page.keyboard.press("Enter")
  await expect.poll(async () => (await events()).map(event => event.title)).toEqual(["Dentist"])
  await details.getByRole("combobox", { name: "Local", exact: true }).click()
  await page.keyboard.type("Office")
  await page.keyboard.press("Enter")
  await details.getByRole("button", { name: "Verde", exact: true }).click()
  await expect.poll(async () => (await events())[0]).toMatchObject({ location: "Office", color: "#10B981" })

  await page.reload()
  await page.getByRole("button", { name: /^Dentist,/ }).first().click()
  await expect(details.getByText("Office", { exact: true })).toBeVisible()
  await details.getByRole("switch", { name: "Dia inteiro", exact: true }).click()
  await expect.poll(async () => (await events())[0].allDay).toBe(true)

  await details.getByRole("button", { name: "Mais ações", exact: true }).click()
  await page.getByRole("menuitem", { name: /Excluir/ }).click()
  await expect(page.getByRole("button", { name: /^Dentist,/ })).toHaveCount(0)
  await expect.poll(async () => (await events()).length).toBe(0)
  await page.getByRole("button", { name: "Desfazer", exact: true }).click()
  await expect(page.getByRole("button", { name: /^Dentist,/ }).first()).toBeVisible()
  await expect.poll(async () => (await events()).map(event => [event.title, event.allDay])).toEqual([["Dentist", true]])
})

test("file board: failed uploads and size limit preserve the board and allow retry", async ({ workspace, page }) => {
  const board = await workspace.create("file-boards", { name: "Recoverable uploads" })
  await workspace.go("Arquivos")
  const restore = await workspace.fault(`file-boards/${board.id}/items`, "POST")
  const file = { name: "retry.txt", mimeType: "text/plain", buffer: Buffer.from("Retry contents") }
  await page.getByLabel("Arquivos para enviar").setInputFiles(file)
  await expect(page.getByRole("alert")).toContainText("Synthetic transport failure")
  expect(await workspace.list(`file-boards/${board.id}/items`)).toHaveLength(0)
  await restore()
  await page.getByLabel("Arquivos para enviar").setInputFiles(file)
  await expect(page.getByRole("button", { name: "Abrir retry.txt", exact: true })).toBeVisible()
  const oversized = join(workspace.home, "oversized.bin")
  writeFileSync(oversized, Buffer.alloc(20 * 1024 * 1024 + 1))
  await page.getByLabel("Arquivos para enviar").setInputFiles(oversized)
  await expect(page.getByRole("alert")).toContainText(/too large/i)
  expect(await workspace.list(`file-boards/${board.id}/items`)).toHaveLength(1)
  await expect(page.getByRole("button", { name: "Enviar", exact: true })).toBeEnabled()
})

test("file board: preview and edit text, open PDF pages, expand images and go back to the board", async ({ workspace, page }) => {
  await workspace.create("file-boards", { name: "Other board" })
  const board = await workspace.create<{ id: string }>("file-boards", { name: "Previews" })
  await workspace.go("Arquivos")
  await page.getByRole("button", { name: /^Previews/ }).click()
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4wAAAABJRU5ErkJggg==", "base64")
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
  await page.getByLabel("Arquivos para enviar").setInputFiles([
    { name: "groceries.txt", mimeType: "text/plain", buffer: Buffer.from("# Groceries\n- milk") },
    { name: "bill.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "photo.png", mimeType: "image/png", buffer: png },
  ])
  await expect(page.getByRole("button", { name: "Abrir photo.png", exact: true })).toBeVisible()
  expect(await workspace.list(`file-boards/${board.id}/items`)).toHaveLength(3)

  await page.getByRole("button", { name: "Abrir groceries.txt", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`#/file-board/${board.id}/[^/?]+$`))
  await expect(page.getByRole("heading", { name: "groceries.txt", level: 1 })).toBeVisible()
  const editor = page.getByRole("textbox", { name: "Conteúdo de groceries.txt", exact: true })
  await expect(editor).toHaveValue("# Groceries\n- milk")
  await expect(page.getByRole("navigation", { name: "Caminho da página" })).toContainText("Arquivo")
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toHaveCount(0)
  await editor.press("Control+End")
  await editor.pressSequentially("\n- eggs")
  await page.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect(page.getByText("Arquivo salvo", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toHaveCount(0)
  await editor.pressSequentially("\n- bread")
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toHaveCount(0, { timeout: 10_000 })
  await page.reload()
  await expect(editor).toHaveValue("# Groceries\n- milk\n- eggs\n- bread")
  await editor.press("Control+s")
  await expect(page.getByText("Já estava salvo", { exact: true })).toBeVisible()
  const items = await workspace.list<{ id: string; title: string }>(`file-boards/${board.id}/items`)
  const groceries = items.find(item => item.title === "groceries.txt")!
  expect(await workspace.api.get(`file-items/${groceries.id}/file`).then(response => response.text())).toBe("# Groceries\n- milk\n- eggs\n- bread")
  await page.getByRole("button", { name: "Voltar", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Previews", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Abrir bill.pdf", exact: true }).click()
  await expect(page.locator('iframe[title="bill.pdf"]')).toHaveAttribute("src", /\/api\/file-items\/[^/]+\/file\?v=[^&]+$/)
  await page.reload()
  await expect(page.locator('iframe[title="bill.pdf"]')).toBeVisible()
  await page.getByRole("button", { name: "Voltar", exact: true }).click()

  await page.getByRole("button", { name: "Abrir photo.png", exact: true }).click()
  const lightbox = page.getByRole("dialog", { name: "photo.png" })
  await expect(lightbox.getByRole("img", { name: "photo.png", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(lightbox).toHaveCount(0)
  await page.getByRole("button", { name: "Editar photo.png", exact: true }).click()
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Excluir groceries.txt", exact: true }).click()
  await expect(page.getByRole("button", { name: "Abrir groceries.txt", exact: true })).toHaveCount(0)
  expect(await workspace.list(`file-boards/${board.id}/items`)).toHaveLength(2)
})

test("file board: a markdown file opens as plain text and saves like a text file", async ({ workspace, page }) => {
  const board = await workspace.create<{ id: string }>("file-boards", { name: "Notes" })
  await workspace.go("Arquivos")
  await page.getByRole("button", { name: /^Notes/ }).click()
  await expect(page.getByRole("button", { name: "Novo documento", exact: true })).toHaveCount(0)
  const table = "| item | qty |\n|---|---|\n| milk | 1 |\n"
  await page.getByLabel("Arquivos para enviar").setInputFiles([
    { name: "plan.md", mimeType: "application/octet-stream", buffer: Buffer.from("# Plan\n\n- milk\n") },
    { name: "table.md", mimeType: "text/markdown", buffer: Buffer.from(table) },
  ])
  await expect(page.getByRole("button", { name: "Abrir table.md", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Abrir plan.md", exact: true }).click()
  const editor = page.getByRole("textbox", { name: "Conteúdo de plan.md", exact: true })
  await expect(editor).toHaveValue("# Plan\n\n- milk\n")
  expect(await editor.evaluate(element => element.tagName)).toBe("TEXTAREA")
  await expect(page.getByRole("tab", { name: "Formatado", exact: true })).toHaveCount(0)

  await editor.fill("# Plan\n\n- milk\n- bread\n")
  await editor.press("Control+s")
  await expect(page.getByText("Arquivo salvo", { exact: true })).toBeVisible()
  const items = await workspace.list<{ id: string; title: string }>(`file-boards/${board.id}/items`)
  const plan = items.find(item => item.title === "plan.md")!
  expect(await workspace.api.get(`file-items/${plan.id}/file`).then(response => response.text())).toBe("# Plan\n\n- milk\n- bread\n")

  await page.getByRole("button", { name: "Voltar", exact: true }).click()
  await page.getByRole("button", { name: "Abrir table.md", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Conteúdo de table.md", exact: true })).toHaveValue(table)
  await expect(page.getByRole("status")).toHaveCount(0)
})

test("calendar: grid creation, drag, overlapping events, views, week navigation and dashboard editing", async ({ workspace, page }) => {
  await workspace.create("calendar/events", { title: "Overlapping A", startAt: `${DAY}T10:00:00Z`, endAt: `${DAY}T12:00:00Z` })
  await workspace.create("calendar/events", { title: "Overlapping B", startAt: `${DAY}T11:00:00Z`, endAt: `${DAY}T13:00:00Z` })
  await workspace.go("Calendário")
  const a = page.getByRole("button", { name: /^Overlapping A,/ })
  const b = page.getByRole("button", { name: /^Overlapping B,/ })
  await expect(a).toBeVisible()
  await expect(b).toBeVisible()
  await page.getByRole("button", { name: "Anterior: semana", exact: true }).click()
  await expect(a).toHaveCount(0)
  await page.getByRole("button", { name: "Próximo: semana", exact: true }).click()
  await expect(a).toBeVisible()
  const boundsA = (await a.boundingBox())!
  const boundsB = (await b.boundingBox())!
  expect(boundsA.x).not.toBe(boundsB.x)
  const hour = boundsB.y - boundsA.y

  // A click on an empty slot creates an event there and opens it, ready to name
  const wednesday = (await page.getByRole("group", { name: "quarta-feira, 21 de outubro", exact: true }).boundingBox())!
  await page.mouse.click(wednesday.x + wednesday.width - 8, boundsA.y + 5 * hour + 4)
  await page.keyboard.type("From grid")
  await page.keyboard.press("Enter")
  await expect.poll(async () => (await workspace.list<StoredEvent>("calendar/events")).find(event => event.title === "From grid")?.startAt)
    .toBe(`${DAY}T15:00:00.000Z`)
  await page.keyboard.press("Escape")

  // Dragging an event moves it by the hours it travelled
  const moved = (await b.boundingBox())!
  await page.mouse.move(moved.x + moved.width / 2, moved.y + 8)
  await page.mouse.down()
  await page.mouse.move(moved.x + moved.width / 2, moved.y + 8 + hour / 2, { steps: 4 })
  await page.mouse.move(moved.x + moved.width / 2, moved.y + 8 + 2 * hour, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => (await workspace.list<StoredEvent>("calendar/events")).find(event => event.title === "Overlapping B")?.startAt)
    .toBe(`${DAY}T13:00:00.000Z`)

  await page.getByRole("button", { name: "Semana", exact: true }).click()
  await page.getByRole("menuitem", { name: /^Mês/ }).click()
  await expect(page.getByRole("button", { name: /^Overlapping A,/ })).toBeVisible()
  await page.getByRole("button", { name: "Mês", exact: true }).click()
  await page.getByRole("menuitem", { name: /^Agenda/ }).click()
  await expect(page.getByRole("button", { name: /^From grid,/ })).toBeVisible()

  await workspace.go("Painel")
  await page.getByRole("button", { name: "Abrir Overlapping A", exact: true }).click()
  await page.getByLabel("Título", { exact: true }).fill("Edited from dashboard")
  await page.getByRole("button", { name: "Salvar", exact: true }).click()
  await workspace.go("Calendário")
  await expect(page.getByRole("button", { name: /^Edited from dashboard,/ }).first()).toBeVisible()
})

test("file board: create and switch boards, multiple uploads, bytes, metadata and cleanup", async ({ workspace, page }) => {
  await workspace.go("Arquivos")
  await page.getByRole("button", { name: "Nova pasta", exact: true }).click()
  await page.getByLabel("Nome", { exact: true }).fill("Receipts")
  await page.getByLabel("Descrição", { exact: true }).fill("Synthetic receipts")
  await choose(page, "Tipo", "Recibos")
  await page.getByRole("button", { name: "Criar pasta", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible()
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4wAAAABJRU5ErkJggg==", "base64")
  const note = Buffer.from("Synthetic file contents")
  await page.getByLabel("Arquivos para enviar").setInputFiles([
    { name: "photo.png", mimeType: "image/png", buffer: png }, { name: "note.txt", mimeType: "text/plain", buffer: note },
  ])
  await expect(page.getByRole("button", { name: "Abrir note.txt", exact: true })).toBeVisible()
  await expect(page.getByRole("img", { name: "photo.png", exact: true })).toBeVisible()
  const boards = await workspace.list("file-boards")
  const files = await workspace.list<{ id: string; title: string }>(`file-boards/${boards[0].id}/items`)
  const uploaded = files.find(file => file.title === "note.txt")!
  expect(await workspace.api.get(`file-items/${uploaded.id}/file`).then(response => response.body())).toEqual(note)
  await page.getByRole("button", { name: "Editar note.txt", exact: true }).click()
  await page.getByLabel("Título", { exact: true }).fill("Renamed note")
  await page.getByLabel("Anotações", { exact: true }).fill("Stored metadata")
  await choose(page, "Tipo", "Anotação")
  await page.getByRole("button", { name: "Salvar", exact: true }).click()
  await page.reload()
  await page.getByRole("button", { name: "Editar Renamed note", exact: true }).click()
  await expect(page.getByLabel("Anotações", { exact: true })).toHaveValue("Stored metadata")
  await page.getByRole("button", { name: "Excluir", exact: true }).click()
  await expect(page.getByRole("button", { name: "Editar Renamed note", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Nova pasta", exact: true }).click()
  await page.getByLabel("Nome", { exact: true }).fill("Second board")
  await page.getByRole("button", { name: "Criar pasta", exact: true }).click()
  await expect(page.getByText("Esta pasta está vazia", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /Receipts/ }).click()
  await expect(page.getByRole("img", { name: "photo.png", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Editar photo.png", exact: true }).click()
  await page.getByRole("button", { name: "Excluir", exact: true }).click()
  await expect(page.getByRole("img", { name: "photo.png", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Excluir Receipts", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toHaveCount(0)
  expect(readdirSync(join(workspace.home, "electron/uploads"), { recursive: true }).filter(name => String(name).includes("."))).toHaveLength(0)
})
