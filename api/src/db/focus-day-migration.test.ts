import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { createDb } from "./client"
import { migrationsFolder } from "../test/create-test-app"
import { TasksService } from "../services/tasks.service"

it("adds the focus day to existing tasks without picking them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "focus-day-migration-"))
  const previousFolder = join(dir, "previous")
  await mkdir(join(previousFolder, "meta"), { recursive: true })
  const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"))
  journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < "0006")
  await writeFile(join(previousFolder, "meta/_journal.json"), JSON.stringify(journal))
  for (const entry of journal.entries) await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(previousFolder, `${entry.tag}.sql`))
  const url = `file:${join(dir, "legacy.db")}`
  const legacy = await createDb(url, previousFolder)
  try {
    await legacy.db.run("INSERT INTO tasks (id, title, status, tags, linked_thought_ids, created_at, updated_at) VALUES ('report', 'Report', 'today', '[]', '[]', 1792195200000, 1792195200000)")
  } finally {
    legacy.close()
  }
  const upgraded = await createDb(url, migrationsFolder)
  try {
    const service = new TasksService(upgraded.db)
    expect(await service.get("report")).toMatchObject({ title: "Report", status: "today", focusDay: null })
    await service.update("report", { focusDay: "2026-10-19" })
    expect((await service.list({ limit: 50, focusDay: "2026-10-19" })).map((task) => task.id)).toEqual(["report"])
  } finally {
    upgraded.close()
    await rm(dir, { recursive: true, force: true })
  }
})
