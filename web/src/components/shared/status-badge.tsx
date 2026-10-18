import { cn } from "@/lib/utils"
import type { StatusBadgeProps, StatusTone } from "@/types/ui"

const DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground/60",
  brand: "bg-primary",
}

const TEXT_CLASSES: Record<StatusTone, string> = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  danger: "text-destructive",
  neutral: "text-muted-foreground",
  brand: "text-primary",
}

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium whitespace-nowrap",
        TEXT_CLASSES[tone],
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT_CLASSES[tone])} aria-hidden="true" />
      {label}
    </span>
  )
}
