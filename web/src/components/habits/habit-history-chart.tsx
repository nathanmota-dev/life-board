import { useTranslation } from "react-i18next"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { lastDays } from "@/lib/dates"
import { goalsMetPerDay } from "@/lib/habits"
import type { HabitHistoryChartProps } from "@/types/habit"

export function HabitHistoryChart({ habits, logs }: HabitHistoryChartProps) {
  const { t } = useTranslation()
  const chartConfig = { met: { label: t("habits.goalsMet"), color: "var(--chart-1)" } } satisfies ChartConfig
  const data = goalsMetPerDay(habits, logs, lastDays(14))

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: -24, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} domain={[0, Math.max(1, habits.length)]} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="met" fill="var(--color-met)" radius={[6, 6, 2, 2]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  )
}
