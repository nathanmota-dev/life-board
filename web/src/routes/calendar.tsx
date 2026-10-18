import { useState } from "react"
import { Plus } from "lucide-react"
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar"
import { CalendarWeek } from "@/components/calendar/calendar-week"
import { EventFormDialog } from "@/components/calendar/event-form-dialog"
import { DataState } from "@/components/shared/data-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Page, PageSection } from "@/components/workspace-ui"
import { useCalendarEvents } from "@/hooks/queries/use-calendar"
import { layoutWeek, weekDays, weekRange } from "@/lib/calendar"
import { startOfWeek } from "@/lib/dates"
import type { EventDialogState } from "@/types/calendar"

export function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek())
  const [dialog, setDialog] = useState<EventDialogState>({ open: false, event: null, start: null })
  const events = useCalendarEvents(weekRange(weekStart))
  const days = weekDays(weekStart)

  return (
    <Page
      title="Calendar"
      description="Your week at a glance."
      actions={
        <Button size="sm" onClick={() => setDialog({ open: true, event: null, start: null })}>
          <Plus />
          New event
        </Button>
      }
      toolbar={<CalendarToolbar weekStart={weekStart} onChange={setWeekStart} />}
    >
      <PageSection>
        <DataState isLoading={events.isLoading} error={events.error} loading={<Skeleton className="h-[32rem] w-full rounded-2xl" />}>
          <CalendarWeek
            days={days}
            layout={layoutWeek(events.data ?? [], days)}
            onCreate={(start) => setDialog({ open: true, event: null, start })}
            onOpen={(event) => setDialog({ open: true, event, start: null })}
          />
        </DataState>
      </PageSection>
      <EventFormDialog
        key={`${dialog.event?.id ?? dialog.start?.toISOString() ?? "new"}-${dialog.open}`}
        open={dialog.open}
        event={dialog.event}
        start={dialog.start}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Page>
  )
}
