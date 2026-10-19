import { describe, expect, it } from "vitest"
import { isTypingTarget, taskToInboxInput, taskToThoughtInput, triageKeyAction } from "@/lib/triage"
import type { Task } from "@/types/task"

const key = (value: string, extra: Partial<KeyboardEvent> = {}) =>
  triageKeyAction({ key: value, ctrlKey: false, metaKey: false, altKey: false, repeat: false, target: document.body, ...extra })

const task: Task = {
  id: "t1",
  title: "Plan trip",
  description: "Check flights",
  status: "today",
  priority: "high",
  dueAt: "2026-10-20T03:00:00.000Z",
  completedAt: null,
  parentTaskId: null,
  tags: ["travel"],
  linkedThoughtIds: ["th9"],
  createdAt: "2026-10-17T10:00:00.000Z",
  updatedAt: "2026-10-17T10:00:00.000Z",
}

describe("triage keys", () => {
  it("maps every documented key to its action", () => {
    expect(["1", "2", "3", "4", "e", "E", "Delete", "Backspace", "ArrowRight", "s", "S", "z", "Z", "Escape"].map((value) => key(value))).toEqual([
      "today", "upcoming", "someday", "thought", "edit", "edit", "delete", "delete", "skip", "skip", "skip", "undo", "undo", "exit",
    ])
    expect(key("x")).toBeNull()
  })

  it("ignores modified, repeated and typed keys", () => {
    expect(key("z", { ctrlKey: true })).toBeNull()
    expect(key("z", { metaKey: true })).toBeNull()
    expect(key("1", { altKey: true })).toBeNull()
    expect(key("1", { repeat: true })).toBeNull()
    expect(key("1", { target: document.createElement("input") })).toBeNull()
  })

  it("recognizes typing targets", () => {
    // jsdom doesn't compute isContentEditable, so the editor declares it.
    const editor = Object.defineProperty(document.createElement("div"), "isContentEditable", { value: true })
    expect(["input", "textarea", "select"].every((tag) => isTypingTarget(document.createElement(tag)))).toBe(true)
    expect(isTypingTarget(editor)).toBe(true)
    expect(isTypingTarget(document.createElement("button"))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe("triage inputs", () => {
  it("rebuilds a task in the inbox", () => {
    expect(taskToInboxInput(task)).toEqual({
      title: "Plan trip",
      description: "Check flights",
      status: "inbox",
      priority: "high",
      dueAt: "2026-10-20T03:00:00.000Z",
      tags: ["travel"],
      linkedThoughtIds: ["th9"],
    })
  })

  it("keeps the title and description in the thought", () => {
    expect(taskToThoughtInput(task)).toEqual({ body: "Plan trip\n\nCheck flights", tags: ["travel"] })
    expect(taskToThoughtInput({ ...task, description: null })).toEqual({ body: "Plan trip", tags: ["travel"] })
  })
})
