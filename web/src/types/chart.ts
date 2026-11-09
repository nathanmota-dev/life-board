import type * as React from "react"
import type * as RechartsPrimitive from "recharts"
import type { TooltipValueType } from "recharts"
import type { ChartConfig } from "@/components/ui/chart-context"

type TooltipNameType = number | string

export type ChartTooltipIndicator = "line" | "dot" | "dashed"

export type ChartTooltipContentProps = React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: ChartTooltipIndicator
    nameKey?: string
    labelKey?: string
  } & Omit<
    RechartsPrimitive.DefaultTooltipContentProps<
      TooltipValueType,
      TooltipNameType
    >,
    "accessibilityLayer"
  >

export type ChartTooltipItemProps = Pick<ChartTooltipContentProps, "color" | "formatter" | "nameKey" | "hideIndicator"> & {
  item: NonNullable<ChartTooltipContentProps["payload"]>[number]
  index: number
  config: ChartConfig
  indicator: ChartTooltipIndicator
  nestLabel: boolean
  tooltipLabel: React.ReactNode
}
