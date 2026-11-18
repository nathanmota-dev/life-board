import { useTranslation } from "react-i18next"
import { CalendarNotices } from "@/components/calendar/calendar-notices"
import { CalendarSurface } from "@/components/calendar/calendar-surface"
import { NewEventButton } from "@/components/calendar/new-event-button"
import { CalendarProvider } from "@/components/calendarcn/calendar-provider"
import { DataState } from "@/components/shared/data-state"
import { Page } from "@/components/workspace-ui"
import { useCalendarBoard } from "@/hooks/use-calendar-board"
import { calendarLocale, newCalendarItem } from "@/lib/calendar"
import type { CalendarItem } from "@/types/calendar"

export function CalendarPage() {
  const { t, i18n } = useTranslation()
  const { error, ...board } = useCalendarBoard()

  return (
    <CalendarProvider<CalendarItem>
      {...board}
      createEvent={newCalendarItem}
      locale={calendarLocale(i18n.resolvedLanguage)}
      hourCycle={24}
      defaultWeekStartsOn={0}
      defaultView="week"
    >
      <CalendarNotices />
      <Page title={t("navigation.calendar")} description={t("calendar.description")} actions={<NewEventButton />}>
        <DataState isLoading={false} error={error}>
          <CalendarSurface />
        </DataState>
      </Page>
    </CalendarProvider>
  )
}
