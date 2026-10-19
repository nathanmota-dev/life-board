import { useTranslation } from "react-i18next"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { goalsMetPerDay } from "@/lib/habits"
import type { HabitHistoryChartProps } from "@/types/habit"

export function HabitHistoryChart({ habits, logs, days }: HabitHistoryChartProps) {
  const { t } = useTranslation()
  const chartConfig = {
    met: { label: t("habits.completed"), color: "var(--chart-1)" },
    partial: { label: t("habits.partial"), color: "var(--chart-3)" },
    missed: { label: t("habits.missed"), color: "var(--border)" },
    pending: { label: t("habits.pending"), color: "var(--muted)" },
  }
  const data = goalsMetPerDay(habits, logs, days)

  return (
    <div>
      <ChartContainer config={chartConfig} className="aspect-auto h-60 w-full">
        <BarChart accessibilityLayer data={data} margin={{ left: -24, right: 8, top: 12 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} domain={[0, Math.max(1, habits.length)]} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {Object.keys(chartConfig).map((key) => <Bar key={key} dataKey={key} stackId="days" fill={`var(--color-${key})`} maxBarSize={32} />)}
        </BarChart>
      </ChartContainer>
      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        {Object.entries(chartConfig).map(([key, config]) => <span key={key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: config.color }} />{config.label}</span>)}
      </div>
    </div>
  )
}
