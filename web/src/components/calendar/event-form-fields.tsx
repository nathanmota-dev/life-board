import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import { FormField } from "@/components/shared/form-field"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EVENT_COLORS } from "@/lib/calendar"
import type { EventFormFieldsProps, EventFormValues } from "@/types/calendar"

export function EventFormFields({ values, onChange }: EventFormFieldsProps) {
  const { t } = useTranslation()
  const set = <K extends keyof EventFormValues>(field: K, value: EventFormValues[K]) => onChange({ ...values, [field]: value })
  const inputType = values.allDay ? "date" : "datetime-local"
  const pick = (value: string) => (values.allDay ? value.slice(0, 10) : value)

  return (
    <>
      <FormField label={t("common.title")} htmlFor="event-title">
        <Input id="event-title" autoFocus value={values.title} onChange={(event) => set("title", event.target.value)} placeholder={t("calendar.titlePlaceholder")} />
      </FormField>
      <div className="flex items-center gap-2">
        <Checkbox id="event-all-day" checked={values.allDay} onCheckedChange={(checked) => set("allDay", checked === true)} />
        <Label htmlFor="event-all-day" className="font-normal">{t("calendar.allDay")}</Label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("calendar.starts")} htmlFor="event-start">
          <Input
            id="event-start"
            type={inputType}
            value={pick(values.start)}
            onChange={(event) => set("start", values.allDay ? `${event.target.value}T00:00` : event.target.value)}
          />
        </FormField>
        <FormField label={t("calendar.ends")} htmlFor="event-end">
          <Input
            id="event-end"
            type={inputType}
            value={pick(values.end)}
            onChange={(event) => set("end", values.allDay ? `${event.target.value}T00:00` : event.target.value)}
          />
        </FormField>
      </div>
      <FormField label={t("calendar.location")} htmlFor="event-location">
        <Input id="event-location" value={values.location} onChange={(event) => set("location", event.target.value)} />
      </FormField>
      <FormField label={t("common.notes")} htmlFor="event-description">
        <Textarea id="event-description" rows={2} value={values.description} onChange={(event) => set("description", event.target.value)} />
      </FormField>
      <div className="flex items-center gap-2" role="radiogroup" aria-label={t("calendar.eventColor")}>
        {EVENT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={values.color === color}
            aria-label={t("calendar.color", { color })}
            onClick={() => set("color", color)}
            className="flex size-6 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{ backgroundColor: color }}
          >
            {values.color === color ? <Check className="size-3.5 text-white" /> : null}
          </button>
        ))}
      </div>
    </>
  )
}
