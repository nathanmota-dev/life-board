import { describe, expect, it } from "vitest"
import { buildActivity } from "@/lib/activity"
import { tasksForToday } from "@/lib/dashboard"
import { averageMood, moodChartData } from "@/lib/mood"
import { summarizeTags } from "@/lib/tags"
import { toDayKey } from "@/lib/dates"
import type { MoodEntry } from "@/types/mood"
import type { Task } from "@/types/task"
import type { Thought } from "@/types/thought"

const baseTask: Task = {
  id: "t1",
  title: "Task",
  description: null,
  status: "inbox",
  priority: "none",
  dueAt: null,
  completedAt: null,
  parentTaskId: null,
  tags: [],
  linkedThoughtIds: [],
  pinned: false,
  color: null,
  order: 0,
  archivedAt: null,
  focusDay: null,
  createdAt: "2026-10-16T10:00:00.000Z",
  updatedAt: "",
}
const thought: Thought = { id: "th1", title: "Idea", body: "", tags: ["ideas", "work"], pinned: false, linkedTaskIds: [], createdAt: "2026-10-17T10:00:00.000Z", updatedAt: "" }
const mood = (day: string, score: number): MoodEntry => ({ id: day, day, score, note: null, createdAt: `${day}T12:00:00.000Z`, updatedAt: "" })

describe("summaries", () => {
  it("counts tags across tasks and thoughts", () => {
    expect(summarizeTags([{ ...baseTask, tags: ["work"] }], [thought])).toEqual([
      { name: "work", tasks: 1, thoughts: 1, total: 2 },
      { name: "ideas", tasks: 0, thoughts: 1, total: 1 },
    ])
  })

  it("picks today's tasks: planned for today, due or overdue, not done", () => {
    const now = new Date(2026, 9, 17, 12)
    const tasks = [
      { ...baseTask, id: "a", status: "today" as const },
      { ...baseTask, id: "b", dueAt: new Date(2026, 9, 17, 18).toISOString() },
      { ...baseTask, id: "c", dueAt: new Date(2026, 9, 20).toISOString() },
      { ...baseTask, id: "d", status: "done" as const },
    ]
    expect(tasksForToday(tasks, now).map((task) => task.id)).toEqual(["a", "b"])
  })

  it("averages recent mood and orders chart points", () => {
    const today = toDayKey()
    const entries = [mood(today, 4), mood(toDayKey(new Date(Date.now() - 86_400_000)), 2), mood("2020-01-01", 5)]
    expect(averageMood(entries, 7)).toBe(3)
    expect(averageMood([], 7)).toBeNull()
    expect(moodChartData(entries).map((point) => point.score)).toEqual([2, 4])
  })

  it("builds a newest-first activity feed grouped by day", () => {
    const days = buildActivity({
      tasks: [{ ...baseTask, completedAt: "2026-10-17T15:00:00.000Z" }],
      thoughts: [thought],
      mood: [],
      goals: [],
    })
    const items = days.flatMap((day) => day.items.map((item) => item.detail))
    expect(items).toEqual(["Task completed", "Thought captured", "Task created"])
  })
})
