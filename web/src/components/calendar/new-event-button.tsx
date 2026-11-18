import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { useCalendar } from "@/components/calendarcn/calendar-provider"
import { Button } from "@/components/ui/button"
import { nextHourRange } from "@/lib/calendar"

/** Adds an event in the next hour and opens its details, with the title ready to type. */
export function NewEventButton() {
  const { t } = useTranslation()
  const { view, switchView, goToToday, addEventFromRange } = useCalendar()

  const create = () => {
    // The year view draws no events to open the details on
    if (view === "year") switchView("week")
    goToToday()
    addEventFromRange(nextHourRange())
  }

  return (
    <Button size="sm" onClick={create}>
      <Plus />
      {t("calendar.newEvent")}
    </Button>
  )
}
