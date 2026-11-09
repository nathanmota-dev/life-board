import { describe, test } from "vitest"
import { groupBoardTasks, sortForList } from "@/lib/tasks"
import type { BoardTask, TaskPriority, TaskStatus } from "@/types/task"

const benchmarkOptions = { time: 1_000, iterations: 20, warmupTime: 250, warmupIterations: 10 }
const priorities: TaskPriority[] = ["high", "medium", "low", "none"]
const statuses: TaskStatus[] = ["inbox", "today", "upcoming", "done"]
const tasks: BoardTask[] = Array.from({ length: 2_000 }, (_, index) => ({
  id: `task-${index}`,
  title: `Task ${index}`,
  description: null,
  status: statuses[index % statuses.length],
  priority: priorities[index % priorities.length],
  dueAt: index % 3 === 0 ? null : new Date(Date.UTC(2026, 9, (index % 28) + 1)).toISOString(),
  completedAt: null,
  parentTaskId: null,
  tags: [],
  linkedThoughtIds: [],
  pinned: index % 5 === 0,
  color: null,
  order: 2_000 - index,
  archivedAt: null,
  focusDay: null,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  children: [],
}))

describe("task ordering", () => {
  test("group 2000 board tasks", async ({ bench }) => {
    await bench("group 2000 board tasks", () => {
      groupBoardTasks(tasks)
    }).run(benchmarkOptions)
  })

  test("sort 2000 list tasks", async ({ bench }) => {
    await bench("sort 2000 list tasks", () => {
      sortForList(tasks)
    }).run(benchmarkOptions)
  })
})
