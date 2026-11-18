import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toEventInput } from "@/lib/calendar"
import { createEventSync, EVENT_SAVE_DELAY_MS, mergeServerEvents } from "@/lib/calendar-sync"
import type { CalendarEvent, CalendarItem, EventSyncService } from "@/types/calendar"

function stored(id: string, title = id): CalendarEvent {
  return {
    id,
    title,
    description: null,
    startAt: new Date(2026, 9, 12, 9).toISOString(),
    endAt: new Date(2026, 9, 12, 10).toISOString(),
    allDay: false,
    location: null,
    color: "#FF892B",
    createdAt: "",
    updatedAt: "",
  }
}

function item(id: string, title = id): CalendarItem {
  return { id, title, start: new Date(2026, 9, 12, 9), end: new Date(2026, 9, 12, 10), color: "orange" }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function setup(service: Partial<EventSyncService> = {}) {
  const calls = {
    create: vi.fn(service.create ?? (async (input) => ({ ...stored("server-1"), title: input.title }))),
    update: vi.fn(service.update ?? (async (id: string) => stored(id))),
    remove: vi.fn(service.remove ?? (async () => ({ ok: true }))),
  }
  const onSaved = vi.fn()
  const onError = vi.fn()
  const sync = createEventSync({ service: calls, toInput: toEventInput, onSaved, onError })
  return { sync, calls, onSaved, onError }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("createEventSync", () => {
  it("creates events and maps the API id to the view's id", async () => {
    const { sync, calls, onSaved } = setup()
    await sync.create(item("client-1", "Gym"))
    expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ title: "Gym" }))
    expect(sync.displayIdOf("server-1")).toBe("client-1")
    expect(sync.displayIdOf("other")).toBe("other")
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(sync.isPending("client-1")).toBe(false)
  })

  it("saves only the latest of quick edits, once the delay passes", async () => {
    const { sync, calls } = setup()
    sync.update(item("e1", "G"))
    sync.update(item("e1", "Gy"))
    sync.update(item("e1", "Gym"))
    expect(sync.isPending("e1")).toBe(true)
    await vi.advanceTimersByTimeAsync(EVENT_SAVE_DELAY_MS)
    expect(calls.update).toHaveBeenCalledTimes(1)
    expect(calls.update).toHaveBeenCalledWith("e1", expect.objectContaining({ title: "Gym" }))
    expect(sync.isPending("e1")).toBe(false)
  })

  it("waits for a running create before editing or removing the new event", async () => {
    const created = deferred<CalendarEvent>()
    const { sync, calls } = setup({ create: () => created.promise })
    const creating = sync.create(item("client-1"))
    sync.update(item("client-1", "Renamed"))
    await vi.advanceTimersByTimeAsync(EVENT_SAVE_DELAY_MS)
    expect(calls.update).not.toHaveBeenCalled()
    created.resolve(stored("server-9"))
    await creating
    await vi.waitFor(() => expect(calls.update).toHaveBeenCalledWith("server-9", expect.objectContaining({ title: "Renamed" })))
    await sync.remove(item("client-1"))
    expect(calls.remove).toHaveBeenCalledWith("server-9")
    expect(sync.isRemoved("client-1")).toBe(true)
  })

  it("drops a waiting edit when the event is removed, and forgets the removal when it comes back", async () => {
    const { sync, calls } = setup()
    sync.update(item("e1", "Edited"))
    await sync.remove(item("e1"))
    await vi.advanceTimersByTimeAsync(EVENT_SAVE_DELAY_MS)
    expect(calls.update).not.toHaveBeenCalled()
    expect(calls.remove).toHaveBeenCalledWith("e1")
    await sync.create(item("e1"))
    expect(sync.isRemoved("e1")).toBe(false)
  })

  it("saves waiting edits at once on flush", async () => {
    const { sync, calls } = setup()
    sync.update(item("e1", "Now"))
    await sync.flushAll()
    expect(calls.update).toHaveBeenCalledWith("e1", expect.objectContaining({ title: "Now" }))
  })

  it("reports failed requests and stops tracking them", async () => {
    const failure = new Error("offline")
    const { sync, onError, onSaved } = setup({ remove: () => Promise.reject(failure) })
    await sync.remove(item("e1"))
    expect(onError).toHaveBeenCalledWith(failure)
    expect(onSaved).not.toHaveBeenCalled()
    expect(sync.isPending("e1")).toBe(false)
  })
})

describe("mergeServerEvents", () => {
  it("lists stored events, keeps newer edits and new events, and hides removed ones", async () => {
    const created = deferred<CalendarEvent>()
    const { sync } = setup({ create: () => created.promise })
    sync.update(item("edited", "Local title"))
    void sync.create(item("new"))
    void sync.remove(item("gone"))

    const merged = mergeServerEvents(
      [stored("plain"), stored("edited", "Server title"), stored("gone")],
      [item("edited", "Local title"), item("new"), item("stale")],
      sync,
    )

    expect(merged.map(({ id, title }) => [id, title])).toEqual([
      ["plain", "plain"],
      ["edited", "Local title"],
      ["new", "new"],
    ])
    created.resolve(stored("server-new"))
  })

  it("shows an event created in the view under its client id once the API lists it", async () => {
    const { sync } = setup({ create: async () => stored("server-1") })
    await sync.create(item("client-1"))
    const merged = mergeServerEvents([stored("server-1", "Saved")], [], sync)
    expect(merged.map(({ id, title }) => [id, title])).toEqual([["client-1", "Saved"]])
  })
})
