import { describe, expect, it } from "vitest"
import { countByStatus, emptyTaskValues, isOverdue, taskToValues, valuesToInput } from "@/lib/tasks"
import type { Task } from "@/types/task"

const task: Task = {
  id: "t1",
  title: "Pay rent",
  description: null,
  status: "today",
  priority: "high",
  dueAt: new Date(2026, 9, 10).toISOString(),
  completedAt: null,
  parentTaskId: null,
  tags: ["home"],
  linkedThoughtIds: [],
  createdAt: "",
  updatedAt: "",
}

describe("task helpers", () => {
  it("flags overdue open tasks only", () => {
    const now = new Date(2026, 9, 17)
    expect(isOverdue(task, now)).toBe(true)
    expect(isOverdue({ ...task, status: "done" }, now)).toBe(false)
    expect(isOverdue({ ...task, dueAt: null }, now)).toBe(false)
  })

  it("converts between tasks and form values", () => {
    expect(emptyTaskValues("today")).toMatchObject({ status: "today", title: "" })
    const values = taskToValues(task)
    expect(values).toMatchObject({ dueAt: "2026-10-10", tags: "home" })
    expect(valuesToInput({ ...values, title: "  Pay rent ", tags: "Home, bills, home", description: " " })).toMatchObject({
      title: "Pay rent",
      description: null,
      tags: ["home", "bills"],
    })
  })

  it("counts tasks per status", () => {
    expect(countByStatus([task, { ...task, id: "t2", status: "done" }])).toEqual({ inbox: 0, today: 1, upcoming: 0, someday: 0, done: 1 })
  })
})
