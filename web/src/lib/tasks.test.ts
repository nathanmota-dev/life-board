import { afterEach, describe, expect, it } from "vitest"
import {
  boardOrder,
  canCompleteFromChecklist,
  checklistView,
  collectTags,
  countByStatus,
  draftToInput,
  emptyDraft,
  emptyTaskValues,
  filterBoardTasks,
  groupBoardTasks,
  hasActiveFilters,
  insertDraftItem,
  isOverdue,
  matchesChip,
  moveBoardTask,
  newDraftItem,
  readTaskLayout,
  removeDraftItem,
  saveTaskLayout,
  sortForList,
  TASK_LAYOUT_STORAGE_KEY,
  taskToValues,
  toggleDraftChecklist,
  valuesToInput,
} from "@/lib/tasks"
import type { BoardTask, Task } from "@/types/task"

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
  pinned: false,
  color: null,
  order: 0,
  archivedAt: null,
  focusDay: null,
  createdAt: "",
  updatedAt: "",
}

const card = (id: string, overrides: Partial<BoardTask> = {}): BoardTask => ({
  ...task,
  id,
  title: id,
  status: "inbox",
  priority: "none",
  dueAt: null,
  tags: [],
  children: [],
  ...overrides,
})

const ids = (tasks: Task[]) => tasks.map((item) => item.id)

afterEach(() => localStorage.clear())

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

describe("board filters", () => {
  const now = new Date(2026, 9, 17, 9)
  const dueToday = card("due-today", { dueAt: new Date(2026, 9, 17).toISOString() })
  const dueLater = card("due-later", { dueAt: new Date(2026, 9, 20).toISOString() })
  const late = card("late", { dueAt: new Date(2026, 9, 1).toISOString(), tags: ["home"], color: "red" })
  const someday = card("someday", { status: "someday", tags: ["fun"] })
  const today = card("today", { status: "today" })
  const done = card("done", { status: "done", dueAt: new Date(2026, 9, 17).toISOString() })
  const all = [dueToday, dueLater, late, someday, today]

  it("matches each chip by status or due date", () => {
    expect(ids(all.filter((item) => matchesChip(item, "today", now)))).toEqual(["due-today", "today"])
    expect(ids(all.filter((item) => matchesChip(item, "upcoming", now)))).toEqual(["due-later"])
    expect(ids(all.filter((item) => matchesChip(item, "someday", now)))).toEqual(["someday"])
    expect(ids(all.filter((item) => matchesChip(item, "overdue", now)))).toEqual(["late"])
    expect(all.every((item) => matchesChip(item, "all", now) && matchesChip(item, "archived", now))).toBe(true)
    expect(all.some((item) => matchesChip(item, "completed", now))).toBe(false)
  })

  it("keeps done tasks out of every chip but Completed and Archived", () => {
    expect((["all", "today", "overdue"] as const).some((chip) => matchesChip(done, chip, now))).toBe(false)
    expect(matchesChip(done, "completed", now) && matchesChip(done, "archived", now)).toBe(true)
  })

  it("combines chip, tag and color filters", () => {
    expect(ids(filterBoardTasks(all, { chip: "overdue", tag: "home", color: "red" }, now))).toEqual(["late"])
    expect(ids(filterBoardTasks(all, { chip: "all", tag: "home", color: null }, now))).toEqual(["late"])
    expect(ids(filterBoardTasks(all, { chip: "all", tag: null, color: "blue" }, now))).toEqual([])
    expect(ids(filterBoardTasks(all, { chip: "today", tag: "home", color: null }, now))).toEqual([])
  })

  it("tells whether any filter or search is active and lists the tags in use", () => {
    expect(hasActiveFilters({ chip: "all", tag: null, color: null }, "  ")).toBe(false)
    expect(hasActiveFilters({ chip: "all", tag: null, color: null }, "rent")).toBe(true)
    expect(hasActiveFilters({ chip: "all", tag: null, color: "red" }, "")).toBe(true)
    expect(collectTags(all)).toEqual(["fun", "home"])
  })
})

describe("board grouping and ordering", () => {
  it("splits tasks into pinned and others by order", () => {
    const sections = groupBoardTasks([card("b", { order: 2 }), card("a", { order: 1, pinned: true }), card("c", { order: 1 })])
    expect(ids(sections.pinned)).toEqual(["a"])
    expect(ids(sections.others)).toEqual(["c", "b"])
  })

  it("sorts the list view by state, priority and due date", () => {
    const sorted = sortForList([
      card("done", { status: "done", priority: "high" }),
      card("low", { priority: "low" }),
      card("high-undated", { priority: "high" }),
      card("high-dated", { priority: "high", dueAt: "2026-10-01T00:00:00.000Z" }),
    ])
    expect(ids(sorted)).toEqual(["high-dated", "high-undated", "low", "done"])
  })

  it("moves cards within and across sections", () => {
    const sections = { pinned: [card("p1", { pinned: true })], others: [card("o1"), card("o2"), card("o3")] }

    const within = moveBoardTask(sections, "o3", "o1")
    expect(within && ids(within.others)).toEqual(["o3", "o1", "o2"])

    const pinned = moveBoardTask(sections, "o2", "p1")
    expect(pinned && ids(pinned.pinned)).toEqual(["o2", "p1"])
    expect(pinned?.pinned[0].pinned).toBe(true)
    expect(pinned && ids(pinned.others)).toEqual(["o1", "o3"])

    const toEmptyArea = moveBoardTask(sections, "p1", "others")
    expect(toEmptyArea && ids(toEmptyArea.others)).toEqual(["o1", "o2", "o3", "p1"])
    expect(toEmptyArea?.pinned).toEqual([])

    const toEnd = moveBoardTask(sections, "o1", "others")
    expect(toEnd && ids(toEnd.others)).toEqual(["o2", "o3", "o1"])

    expect(moveBoardTask(sections, "o1", "o1")).toBeNull()
    expect(moveBoardTask(sections, "o1", null)).toBeNull()
    expect(moveBoardTask(sections, "o3", "others")).toBeNull()
    expect(moveBoardTask(sections, "missing", "o1")).toBeNull()
  })

  it("numbers pinned cards first, then the others", () => {
    expect(boardOrder({ pinned: [card("p1")], others: [card("o1"), card("o2")] })).toEqual([
      { id: "p1", order: 0, pinned: true },
      { id: "o1", order: 1, pinned: false },
      { id: "o2", order: 2, pinned: false },
    ])
  })
})

describe("checklists", () => {
  const item = (id: string, done = false) => card(id, { parentTaskId: "parent", status: done ? "done" : "inbox" })

  it("puts ticked items below and collapses them after three", () => {
    const items = [item("d1", true), item("o1"), item("d2", true), item("d3", true), item("d4", true), item("o2")]
    const collapsed = checklistView(items)
    expect(ids(collapsed.open)).toEqual(["o1", "o2"])
    expect(ids(collapsed.done)).toEqual(["d1", "d2", "d3"])
    expect(collapsed.hiddenDone).toBe(1)
    expect(checklistView(items, true)).toMatchObject({ hiddenDone: 0, done: expect.arrayContaining([expect.objectContaining({ id: "d4" })]) })
  })

  it("offers completing the task once every item is ticked", () => {
    expect(canCompleteFromChecklist(card("t", { children: [item("a", true), item("b", true)] }))).toBe(true)
    expect(canCompleteFromChecklist(card("t", { children: [item("a", true), item("b")] }))).toBe(false)
    expect(canCompleteFromChecklist(card("t", { children: [] }))).toBe(false)
    expect(canCompleteFromChecklist(card("t", { status: "done", children: [item("a", true)] }))).toBe(false)
  })
})

describe("composer drafts", () => {
  it("does not save an empty draft", () => {
    expect(draftToInput(emptyDraft())).toBeNull()
    expect(draftToInput({ ...emptyDraft(), title: "  ", notes: " \n " })).toBeNull()
    expect(draftToInput({ ...emptyDraft(), checklist: true, items: [newDraftItem(" ")] })).toBeNull()
  })

  it("builds plain and checklist tasks", () => {
    expect(draftToInput({ ...emptyDraft(), title: " Pay rent ", notes: " by Friday " })).toEqual({ title: "Pay rent", description: "by Friday" })
    expect(draftToInput({ ...emptyDraft(), notes: "Call mom\nabout the trip" })).toEqual({ title: "Call mom", description: "about the trip" })
    expect(draftToInput({ ...emptyDraft(), title: "Groceries", checklist: true, items: [newDraftItem("Eggs"), newDraftItem(" "), newDraftItem("Milk")] })).toEqual({
      title: "Groceries",
      description: null,
      items: ["Eggs", "Milk"],
    })
    expect(draftToInput({ ...emptyDraft(), checklist: true, items: [newDraftItem("Eggs")] })).toMatchObject({ title: "Checklist", items: ["Eggs"] })
  })

  it("turns notes lines into checklist items and back", () => {
    const checklist = toggleDraftChecklist({ ...emptyDraft(), notes: "Eggs\n\nMilk" })
    expect(checklist).toMatchObject({ checklist: true, notes: "", items: [{ text: "Eggs" }, { text: "Milk" }] })
    expect(toggleDraftChecklist(checklist)).toMatchObject({ checklist: false, notes: "Eggs\nMilk", items: [{ text: "" }] })
    expect(toggleDraftChecklist(emptyDraft()).items).toHaveLength(1)
  })

  it("inserts an item after Enter and removes an empty one on Backspace", () => {
    const [a, b] = [newDraftItem("a"), newDraftItem("b")]
    const inserted = insertDraftItem([a, b], a.id)
    expect(inserted.items.map((item) => item.text)).toEqual(["a", "", "b"])
    expect(inserted.focusId).toBe(inserted.items[1].id)

    expect(removeDraftItem(inserted.items, inserted.focusId)).toEqual({ items: [a, b], focusId: a.id })
    expect(removeDraftItem([a, b], a.id)).toEqual({ items: [b], focusId: b.id })
    expect(removeDraftItem([a], a.id)).toBeNull()
  })
})

describe("layout preference", () => {
  it("defaults to the board and remembers the list", () => {
    expect(readTaskLayout()).toBe("board")
    saveTaskLayout("list")
    expect(localStorage.getItem(TASK_LAYOUT_STORAGE_KEY)).toBe("list")
    expect(readTaskLayout()).toBe("list")
  })
})
