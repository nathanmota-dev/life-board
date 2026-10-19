import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { createDb } from "./client"
import { migrationsFolder } from "../test/create-test-app"
import { TasksService, type TaskWithChildren } from "../services/tasks.service"

it("upgrades existing tasks onto the board with their subtasks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasks-migration-"))
  const previousFolder = join(dir, "previous")
  await mkdir(join(previousFolder, "meta"), { recursive: true })
  const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"))
  journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < "0005")
  await writeFile(join(previousFolder, "meta/_journal.json"), JSON.stringify(journal))
  for (const entry of journal.entries) await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(previousFolder, `${entry.tag}.sql`))
  const url = `file:${join(dir, "legacy.db")}`
  const legacy = await createDb(url, previousFolder)
  try {
    await legacy.db.run("INSERT INTO tasks (id, title, tags, linked_thought_ids, created_at, updated_at) VALUES ('trip', 'Trip', '[]', '[]', 1792195200000, 1792195200000)")
    await legacy.db.run("INSERT INTO tasks (id, title, parent_task_id, tags, linked_thought_ids, created_at, updated_at) VALUES ('passport', 'Passport', 'trip', '[]', '[]', 1792195200000, 1792195200000)")
  } finally {
    legacy.close()
  }
  const upgraded = await createDb(url, migrationsFolder)
  try {
    const [trip] = (await new TasksService(upgraded.db).list({ limit: 50, include: "children" })) as TaskWithChildren[]
    expect(trip).toMatchObject({ title: "Trip", pinned: false, color: null, order: 0, archivedAt: null })
    expect(trip.children.map((item) => item.title)).toEqual(["Passport"])
  } finally {
    upgraded.close()
    await rm(dir, { recursive: true, force: true })
  }
})
