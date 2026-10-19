import { useTranslation } from "react-i18next"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { GoalProgressLineProps } from "@/types/goal"

export function GoalProgressLine({ points }: GoalProgressLineProps) {
  const { t } = useTranslation()
  const chartConfig = { progress: { label: t("goals.progress"), color: "var(--chart-1)" } } satisfies ChartConfig
  const known = points.filter((point) => point.progress !== null).length

  return known > 0 ? (
    <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full">
      <AreaChart data={points} margin={{ left: -24, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="goal-progress-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-progress)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-progress)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} axisLine={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        {/* A lone snapshot draws no line, so it gets a dot to stay visible. */}
        <Area isAnimationActive={false} dataKey="progress" type="stepAfter" stroke="var(--color-progress)" strokeWidth={2} fill="url(#goal-progress-fill)" dot={known === 1 ? { r: 3, fill: "var(--color-progress)" } : false} />
      </AreaChart>
    </ChartContainer>
  ) : (
    <p className="py-8 text-center text-sm text-muted-foreground">{t("goals.noHistory")}</p>
  )
}
