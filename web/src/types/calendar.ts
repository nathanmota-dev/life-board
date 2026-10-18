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

/** A timed event placed on the weekly grid; overlapping events share the column in lanes. */
export type PositionedEvent = {
  event: CalendarEvent
  dayIndex: number
  startMinute: number
  endMinute: number
  lane: number
  lanes: number
}

export type WeekLayout = { allDay: CalendarEvent[][]; timed: PositionedEvent[][] }

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

export type CalendarToolbarProps = { weekStart: Date; onChange: (weekStart: Date) => void }

export type CalendarWeekProps = {
  days: Date[]
  layout: WeekLayout
  onCreate: (start: Date) => void
  onOpen: (event: CalendarEvent) => void
}

export type DayColumnProps = {
  day: Date
  events: PositionedEvent[]
  onCreate: (start: Date) => void
  onOpen: (event: CalendarEvent) => void
}

export type EventBlockProps = { item: PositionedEvent; onOpen: (event: CalendarEvent) => void }

export type AllDayChipProps = { event: CalendarEvent; onOpen: (event: CalendarEvent) => void }

export type EventFormDialogProps = {
  open: boolean
  event: CalendarEvent | null
  start: Date | null
  onOpenChange: (open: boolean) => void
}

export type EventFormFieldsProps = { values: EventFormValues; onChange: (values: EventFormValues) => void }
