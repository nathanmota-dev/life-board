import { useTranslation } from "react-i18next"
import { useState } from "react"
import type { CSSProperties, PointerEvent } from "react"
import { formatDate, fromDayKey } from "@/lib/dates"
import { CONTRIBUTION_LEVELS, contributionGrid, contributionLevelColor, contributionMonthLabels } from "@/lib/github"
import type { ContributionDay, ContributionTooltip, ContributionsGridProps } from "@/types/github"

const GAP_PX = 3
const MIN_CELL_PX = 8
// Keeps the grid from getting too tall when it has a whole wide page to itself.
const MAX_CELL_PX = 20

/** Yearly grid of square cells sized to fill the container width, between `MIN_CELL_PX` and `MAX_CELL_PX`. */
export function ContributionsGrid({ contributions }: ContributionsGridProps) {
  const { t } = useTranslation()
  const describe = (day: ContributionDay) => t("github.contributionsOn", {
    count: day.count,
    date: formatDate(fromDayKey(day.date), { dateStyle: "medium" }),
  })
  const [tooltip, setTooltip] = useState<ContributionTooltip | null>(null)
  const weeks = contributionGrid(contributions.days)
  const months = contributionMonthLabels(weeks)
  const columns: CSSProperties = {
    // Rounded down so sub-pixel sizes never push the grid past the container and show a scrollbar.
    "--cell": `clamp(${MIN_CELL_PX}px, round(down, (100cqw - ${(weeks.length - 1) * GAP_PX}px) / ${weeks.length}, 0.1px), ${MAX_CELL_PX}px)`,
    gridTemplateColumns: `repeat(${weeks.length}, var(--cell))`,
    columnGap: GAP_PX,
    minWidth: weeks.length * (MIN_CELL_PX + GAP_PX) - GAP_PX,
  } as CSSProperties

  const showTooltip = (day: ContributionDay) => (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({ day, left: rect.left + rect.width / 2, top: rect.top })
  }

  return (
    <div className="@container overflow-x-auto pb-1">
      <div className="flex w-fit flex-col gap-2">
        <div className="grid text-xs text-muted-foreground" style={columns}>
          {months.map(({ week, label }) => (
            <span key={week} className="whitespace-nowrap" style={{ gridColumnStart: week + 1 }}>
              {label}
            </span>
          ))}
        </div>
        <div
          className="grid grid-flow-col"
          style={{ ...columns, gridTemplateRows: "repeat(7, var(--cell))", rowGap: GAP_PX }}
          onPointerLeave={() => setTooltip(null)}
        >
          {weeks.flatMap((week, weekIndex) =>
            week.map((day, weekday) =>
              day ? (
                <div
                  key={day.date}
                  role="img"
                  aria-label={describe(day)}
                  data-date={day.date}
                  className="rounded-[3px]"
                  style={{ backgroundColor: contributionLevelColor(day.level) }}
                  onPointerEnter={showTooltip(day)}
                />
              ) : (
                <div key={`${weekIndex}-${weekday}`} />
              ),
            ),
          )}
        </div>
        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>{t("github.contributionsYear", { count: contributions.total })}</span>
          <span className="flex items-center gap-1">
            {t("github.less")}
            {CONTRIBUTION_LEVELS.map((level) => (
              <span key={level} className="size-2.5 rounded-[2px]" style={{ backgroundColor: contributionLevelColor(level) }} />
            ))}
            {t("github.more")}
          </span>
        </div>
      </div>
      {tooltip ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-2.5 py-1 text-xs whitespace-nowrap text-background"
          style={{ left: tooltip.left, top: tooltip.top - 6 }}
        >
          {describe(tooltip.day)}
        </div>
      ) : null}
    </div>
  )
}
