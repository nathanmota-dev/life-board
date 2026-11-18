import { useTranslation } from "react-i18next"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { DatePicker } from "@/components/shared/date-picker"
import { FormField } from "@/components/shared/form-field"
import { toDayKey } from "@/lib/dates"
import type { Period, PeriodFilterProps } from "@/types/ui"

/** 7 days / 30 days / custom range picker, driven by `usePeriod`. */
export function PeriodFilter({ state }: PeriodFilterProps) {
  const { t } = useTranslation()
  const { period, setPeriod, from, setFrom, to, setTo } = state

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SegmentedControl<Period> label={t("period.label")} value={period} onChange={setPeriod} options={[
        { value: "week", label: t("period.week") }, { value: "month", label: t("period.month") }, { value: "custom", label: t("period.custom") },
      ]} />
      {period === "custom" ? <div className="flex flex-wrap items-end gap-3">
        <FormField label={t("period.from")} htmlFor="period-from">
          <DatePicker id="period-from" className="w-auto" value={from} max={to || toDayKey()} onChange={setFrom} />
        </FormField>
        <FormField label={t("period.to")} htmlFor="period-to">
          <DatePicker id="period-to" className="w-auto" value={to} min={from || undefined} max={toDayKey()} onChange={setTo} />
        </FormField>
      </div> : null}
    </div>
  )
}
