import type { DetailedCalendarEvent, EventColor, VisibleRange } from "@/components/calendarcn/calendar-types"

export type CalendarEvent = {
  id: string
  title: string
  description: string | null
  startAt: string
  endAt: string
  allDay: boolean
  location: string | null
  color: string
  createdAt: string
  updatedAt: string
}

export type CalendarEventInput = {
  title: string
  description?: string | null
  startAt: string
  endAt: string
  allDay?: boolean
  location?: string | null
  color?: string
}

export type CalendarRange = { from: string; to: string }

export type EventFormValues = {
  title: string
  allDay: boolean
  start: string
  end: string
  location: string
  description: string
  color: string
}

export type EventDialogState = { open: boolean; event: CalendarEvent | null; start: Date | null }

export type CalendarToolbarProps = { weekStart: Date; onChange: (weekStart: Date) => void; nextDisabled?: boolean }

export type AllDayChipProps = { event: CalendarEvent; onOpen: (event: CalendarEvent) => void }

export type EventFormDialogProps = {
  open: boolean
  event: CalendarEvent | null
  start: Date | null
  onOpenChange: (open: boolean) => void
}

export type EventFormFieldsProps = { values: EventFormValues; onChange: (values: EventFormValues) => void }

/** An event as the calendar view (calendarcn) draws and edits it. */
export type CalendarItem = DetailedCalendarEvent

/** One of the calendar view's named event colors. */
export type CalendarItemColor = EventColor

/** The dates the calendar view draws, `end` exclusive. */
export type CalendarVisibleRange = VisibleRange

/** The API calls the event sync makes. */
export type EventSyncService = {
  create: (input: CalendarEventInput) => Promise<CalendarEvent>
  update: (id: string, input: Partial<CalendarEventInput>) => Promise<CalendarEvent>
  remove: (id: string) => Promise<unknown>
}

export type EventSyncOptions = {
  service: EventSyncService
  toInput: (item: CalendarItem) => CalendarEventInput
  /** Runs after each saved change, to refresh the queries that show events. */
  onSaved: () => void
  onError: (error: unknown) => void
  /** How long edits to one event wait for the next before saving, in ms. */
  delayMs?: number
}

/**
 * Saves the calendar view's edits. Events keep the id they were drawn with:
 * one created in the view keeps its client id, mapped to the id the API gives it.
 */
export type EventSync = {
  create: (item: CalendarItem) => Promise<void>
  update: (item: CalendarItem) => void
  remove: (item: CalendarItem) => Promise<void>
  /** Saves the edits still waiting for their delay. */
  flushAll: () => Promise<void>
  /** The id the view knows a stored event by. */
  displayIdOf: (serverId: string) => string
  /** Whether the event has edits not saved yet, so the view's copy is newer. */
  isPending: (id: string) => boolean
  isRemoved: (id: string) => boolean
}
