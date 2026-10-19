import { useTranslation } from "react-i18next"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Input } from "@/components/ui/input"
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
        <label className="text-xs text-muted-foreground">{t("period.from")}<Input type="date" className="mt-1 w-auto" value={from} max={to || toDayKey()} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-xs text-muted-foreground">{t("period.to")}<Input type="date" className="mt-1 w-auto" value={to} min={from} max={toDayKey()} onChange={(event) => setTo(event.target.value)} /></label>
      </div> : null}
    </div>
  )
}
