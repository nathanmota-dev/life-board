import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { createDb, sqliteFileUrl } from "./client"
import { migrationsFolder } from "../test/create-test-app"
import { HabitsService } from "../services/habits.service"

it("upgrades existing habits without losing daily progress", async () => {
  const dir = await mkdtemp(join(tmpdir(), "habit-migration-"))
  const previousFolder = join(dir, "previous")
  await mkdir(join(previousFolder, "meta"), { recursive: true })
  const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"))
  journal.entries = journal.entries.slice(0, 3)
  await writeFile(join(previousFolder, "meta/_journal.json"), JSON.stringify(journal))
  for (const entry of journal.entries) await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(previousFolder, `${entry.tag}.sql`))
  const url = sqliteFileUrl(join(dir, "legacy.db"))
  const legacy = await createDb(url, previousFolder)
  try {
    await legacy.db.run("INSERT INTO habits (id, name, unit, target, created_at, updated_at) VALUES ('water', 'Water', 'glasses', 6, 1792195200000, 1792195200000)")
    await legacy.db.run("INSERT INTO habit_logs (id, habit_id, day, count, created_at, updated_at) VALUES ('log', 'water', '2026-10-17', 4, 1792195200000, 1792195200000)")
  } finally { legacy.close() }
  const upgraded = await createDb(url, migrationsFolder)
  try {
    const service = new HabitsService(upgraded.db)
    expect((await service.list())[0]).toMatchObject({ name: "Water", target: 6, step: 1, emoji: "🌱" })
    expect(await service.logs({})).toEqual([{ habitId: "water", day: "2026-10-17", count: 4, target: 6 }])
  } finally {
    upgraded.close()
    await rm(dir, { recursive: true, force: true })
  }
})
