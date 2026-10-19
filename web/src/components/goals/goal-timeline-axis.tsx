import { useTranslation } from "react-i18next"
import type { GoalTimelineAxisProps } from "@/types/goal"

export function GoalTimelineAxis({ scale }: GoalTimelineAxisProps) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-[12rem_minmax(0,1fr)] border-b text-xs text-muted-foreground">
      <span className="sticky left-0 z-10 bg-card" />
      <div className="relative h-8">
        {scale.months.map((month) => (
          <span key={month.key} className="absolute inset-y-0 flex items-center truncate border-l pl-1.5" style={{ left: `${month.left}%`, width: `${month.width}%` }}>
            {month.label}
          </span>
        ))}
        <span className="absolute top-0 -translate-x-1/2 rounded-sm bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground" style={{ left: `${scale.today}%` }}>
          {t("common.today")}
        </span>
      </div>
    </div>
  )
}
