import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { createDb, sqliteFileUrl } from "./client"
import { migrationsFolder } from "../test/create-test-app"
import { ProjectsService } from "../services/projects.service"

it("upgrades existing projects to per-column order with a status history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "projects-migration-"))
  const previousFolder = join(dir, "previous")
  await mkdir(join(previousFolder, "meta"), { recursive: true })
  const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"))
  journal.entries = journal.entries.slice(0, 4)
  await writeFile(join(previousFolder, "meta/_journal.json"), JSON.stringify(journal))
  for (const entry of journal.entries) await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(previousFolder, `${entry.tag}.sql`))
  const url = sqliteFileUrl(join(dir, "legacy.db"))
  const legacy = await createDb(url, previousFolder)
  const recent = Date.now() - 60_000
  try {
    await legacy.db.run(`INSERT INTO projects (id, title, status, "order", created_at, updated_at) VALUES
      ('a', 'A', 'idea', 0, 1000, ${recent}),
      ('b', 'B', 'done', 1, 1000, ${recent}),
      ('c', 'C', 'idea', 2, 1000, ${recent}),
      ('old', 'Old', 'done', 3, 1000, 1000)`)
  } finally { legacy.close() }
  const upgraded = await createDb(url, migrationsFolder)
  try {
    const service = new ProjectsService(upgraded.db)
    const { items } = await service.list()
    expect(items.map((p) => [p.id, p.status, p.order])).toEqual([["a", "idea", 0], ["b", "done", 0], ["c", "idea", 1]])
    expect(items[0].statusChangedAt.getTime()).toBe(recent)
    expect((await service.list({ archived: true })).items.map((p) => p.id)).toEqual(["old"])
    expect((await service.history("b")).items).toEqual([expect.objectContaining({ status: "done", changedAt: new Date(recent) })])
  } finally {
    upgraded.close()
    await rm(dir, { recursive: true, force: true })
  }
})
