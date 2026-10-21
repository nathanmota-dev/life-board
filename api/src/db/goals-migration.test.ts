import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { createDb, sqliteFileUrl } from "./client"
import { migrationsFolder } from "../test/create-test-app"
import { GoalsService } from "../services/goals.service"

it.each(["0006", "0007"])("upgrades from before %s keeping manual progress and starting new goals in auto", async (nextMigration) => {
  const dir = await mkdtemp(join(tmpdir(), "goals-migration-"))
  const previousFolder = join(dir, "previous")
  await mkdir(join(previousFolder, "meta"), { recursive: true })
  const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"))
  journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < nextMigration)
  await writeFile(join(previousFolder, "meta/_journal.json"), JSON.stringify(journal))
  for (const entry of journal.entries) await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(previousFolder, `${entry.tag}.sql`))
  const url = sqliteFileUrl(join(dir, "legacy.db"))
  const legacy = await createDb(url, previousFolder)
  try {
    await legacy.db.run("INSERT INTO goals (id, title, progress, linked_task_ids, linked_thought_ids, created_at, updated_at) VALUES ('books', 'Read books', 60, '[]', '[]', 1792195200000, 1792195200000)")
    await legacy.db.run("INSERT INTO goal_milestones (id, goal_id, title, created_at, updated_at) VALUES ('m1', 'books', 'First', 1792195200000, 1792195200000)")
  } finally {
    legacy.close()
  }
  const upgraded = await createDb(url, migrationsFolder)
  try {
    const service = new GoalsService(upgraded.db)
    const [books] = await service.list()
    expect(books).toMatchObject({ progressMode: "manual", progress: 60, linkedHabitIds: [] })
    expect((await service.create({ title: "New" })).goal.progressMode).toBe("auto")
  } finally {
    upgraded.close()
    await rm(dir, { recursive: true, force: true })
  }
})
