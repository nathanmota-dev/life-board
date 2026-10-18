import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { moodChartData } from "@/lib/mood"
import type { MoodTrendChartProps } from "@/types/mood"

const chartConfig = { score: { label: "Mood", color: "var(--chart-1)" } } satisfies ChartConfig

export function MoodTrendChart({ entries }: MoodTrendChartProps) {
  const data = moodChartData(entries)

  return data.length > 1 ? (
    <ChartContainer config={chartConfig} className="aspect-auto h-60 w-full">
      <AreaChart data={data} margin={{ left: -24, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="mood-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-score)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-score)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Area isAnimationActive={false} dataKey="score" type="monotone" stroke="var(--color-score)" strokeWidth={2} fill="url(#mood-fill)" dot={{ r: 3, fill: "var(--color-score)" }} />
      </AreaChart>
    </ChartContainer>
  ) : (
    <p className="py-10 text-center text-sm text-muted-foreground">Log your mood for a couple of days to see the trend.</p>
  )
}
