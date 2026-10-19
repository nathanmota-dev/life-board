import { cn } from "@/lib/utils"
import type { TimerRingProps } from "@/types/pomodoro"

const RADIUS = 108
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function TimerRing({ progress, tone, children }: TimerRingProps) {
  return (
    <div className={cn("relative flex size-64 shrink-0 items-center justify-center sm:size-72", tone === "focus" ? "text-primary" : "text-chart-3")}>
      <svg viewBox="0 0 240 240" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="120" cy="120" r={RADIUS} fill="none" strokeWidth="6" className="stroke-border" />
        <circle
          cx="120"
          cy="120"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      </svg>
      <div className="relative flex flex-col items-center gap-1 text-foreground">{children}</div>
    </div>
  )
}
