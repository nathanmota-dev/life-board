import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight, CalendarClock, CalendarDays } from "lucide-react"
import { AllDayChip } from "@/components/calendar/all-day-chip"
import { EventFormDialog } from "@/components/calendar/event-form-dialog"
import { TimelineEvent } from "@/components/dashboard/timeline-event"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/workspace-ui"
import { useCalendarEvents } from "@/hooks/queries/use-calendar"
import { useNow } from "@/hooks/use-now"
import { dayTimeline, todayRange } from "@/lib/dashboard"
import { formatTime } from "@/lib/dates"
import type { EventDialogState } from "@/types/calendar"
import type { NowLineProps, TimelineListProps } from "@/types/dashboard"

function NowLine({ now }: NowLineProps) {
  const { t } = useTranslation()

  return (
    <li className="flex items-center gap-2 text-xs font-medium text-primary">
      <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      <span className="shrink-0">{t("dashboard.now", { time: formatTime(now) })}</span>
      <span className="h-px flex-1 bg-primary/60" aria-hidden="true" />
    </li>
  )
}

function TimelineList({ timeline, now, onOpen }: TimelineListProps) {
  const { t } = useTranslation()
  const rows = timeline.items.map((item) => <TimelineEvent key={item.event.id} item={item} now={now} onOpen={onOpen} />)
  rows.splice(timeline.nowIndex, 0, <NowLine key="now" now={now} />)

  return (
    <div className="flex flex-col gap-3">
      {timeline.allDay.length > 0 ? (
        <div aria-label={t("dashboard.allDayEvents")} className="grid gap-1.5 sm:grid-cols-2">
          {timeline.allDay.map((event) => (
            <AllDayChip key={event.id} event={event} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
      <ol aria-label={t("dashboard.timeline")} className="flex flex-col gap-2">
        {rows}
      </ol>
    </div>
  )
}

/** Today's events in time order with a "now" line; clicking one opens the event dialog. */
export function MyDayTimeline() {
  const { t } = useTranslation()
  const now = useNow()
  const events = useCalendarEvents(todayRange(now))
  const [dialog, setDialog] = useState<EventDialogState>({ open: false, event: null, start: null })
  const items = events.data ?? []

  return (
    <Panel
      title={t("dashboard.widgets.myDay")}
      icon={CalendarClock}
      action={
        <Button variant="outline" size="icon-sm" aria-label={t("dashboard.openCalendar")} asChild>
          <Link to="/calendar">
            <ArrowUpRight />
          </Link>
        </Button>
      }
    >
      <DataState
        isLoading={events.isLoading}
        error={events.error}
        isEmpty={items.length === 0}
        empty={<EmptyState icon={CalendarDays} title={t("dashboard.noEventsToday")} description={t("dashboard.noEventsTodayDescription")} className="py-6" />}
      >
        <TimelineList timeline={dayTimeline(items, now)} now={now} onOpen={(event) => setDialog({ open: true, event, start: null })} />
      </DataState>
      <EventFormDialog
        key={`${dialog.event?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        event={dialog.event}
        start={dialog.start}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Panel>
  )
}
