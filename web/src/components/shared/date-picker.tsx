import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CalendarIcon } from "lucide-react"
import { DayCalendar } from "@/components/shared/day-calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDate, fromDayKey } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { DatePickerProps } from "@/types/ui"

/** A form field that shows a day and opens a calendar to change it. */
export function DatePicker({ id, value, onChange, clearLabel }: DatePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className={cn("w-full justify-start px-3 font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon />
          <span className="truncate">{value ? formatDate(fromDayKey(value), { day: "2-digit", month: "2-digit", year: "numeric" }) : t("common.pickDate")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <DayCalendar
          value={value}
          clearLabel={clearLabel}
          onChange={(day) => {
            onChange(day)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
