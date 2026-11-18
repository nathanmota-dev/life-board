import { toCalendarItem } from "@/lib/calendar"
import type { CalendarEvent, CalendarItem, EventSync, EventSyncOptions } from "@/types/calendar"

/** How long edits to one event wait for the next before saving: a title typed letter by letter saves once. */
export const EVENT_SAVE_DELAY_MS = 500

/**
 * Saves the calendar view's edits through the API. The view creates events
 * with a client id and keeps drawing them under it, so the id the API gives
 * back is mapped to it, and later edits wait for the create to finish.
 */
export function createEventSync({
  service,
  toInput,
  onSaved,
  onError,
  delayMs = EVENT_SAVE_DELAY_MS,
}: EventSyncOptions): EventSync {
  /** The API id of each event created in the view, or the create still running. */
  const serverIds = new Map<string, Promise<string> | string>()
  /** The view's id of each event created in it, by API id. */
  const displayIds = new Map<string, string>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** The latest edit of each event that waits for its delay. */
  const waiting = new Map<string, CalendarItem>()
  /** Requests running for each event. */
  const running = new Map<string, number>()
  const removed = new Set<string>()

  const serverIdOf = async (id: string) => (await serverIds.get(id)) ?? id

  async function track(id: string, request: () => Promise<unknown>) {
    running.set(id, (running.get(id) ?? 0) + 1)
    try {
      await request()
      onSaved()
    } catch (error) {
      onError(error)
    } finally {
      const left = (running.get(id) ?? 1) - 1
      if (left > 0) running.set(id, left)
      else running.delete(id)
    }
  }

  function cancel(id: string) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    waiting.delete(id)
  }

  function flush(id: string) {
    const item = waiting.get(id)
    cancel(id)
    if (!item) return Promise.resolve()
    return track(id, async () => service.update(await serverIdOf(id), toInput(item)))
  }

  return {
    create(item) {
      removed.delete(item.id)
      const created = service.create(toInput(item)).then((saved) => {
        serverIds.set(item.id, saved.id)
        displayIds.set(saved.id, item.id)
        return saved.id
      })
      serverIds.set(item.id, created)
      return track(item.id, () => created)
    },
    update(item) {
      clearTimeout(timers.get(item.id))
      waiting.set(item.id, item)
      timers.set(
        item.id,
        setTimeout(() => void flush(item.id), delayMs),
      )
    },
    remove(item) {
      cancel(item.id)
      removed.add(item.id)
      return track(item.id, async () => service.remove(await serverIdOf(item.id)))
    },
    async flushAll() {
      await Promise.all([...waiting.keys()].map(flush))
    },
    displayIdOf: (serverId) => displayIds.get(serverId) ?? serverId,
    isPending: (id) => waiting.has(id) || running.has(id),
    isRemoved: (id) => removed.has(id),
  }
}

/**
 * The view's events after the API returned `server`: stored events, except
 * the ones with edits still saving (the view's copy is newer) or being
 * removed, plus events created in the view that the API doesn't list yet.
 */
export function mergeServerEvents(server: CalendarEvent[], local: CalendarItem[], sync: EventSync): CalendarItem[] {
  const localById = new Map(local.map((item) => [item.id, item]))
  const listed = new Set<string>()
  const merged: CalendarItem[] = []
  for (const event of server) {
    const id = sync.displayIdOf(event.id)
    if (sync.isRemoved(id)) continue
    listed.add(id)
    const pending = sync.isPending(id) ? localById.get(id) : undefined
    merged.push(pending ?? toCalendarItem(event, id))
  }
  for (const item of local) {
    if (!listed.has(item.id) && sync.isPending(item.id) && !sync.isRemoved(item.id)) merged.push(item)
  }
  return merged
}
