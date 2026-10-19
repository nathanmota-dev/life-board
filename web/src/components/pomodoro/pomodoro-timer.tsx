import { useTranslation } from "react-i18next"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { TimerControls } from "@/components/pomodoro/timer-controls"
import { TimerRing } from "@/components/pomodoro/timer-ring"
import { formatTime } from "@/lib/dates"
import { cyclePosition, formatCountdown, isBreak, POMODORO_PHASES, sessionsUntilLongBreak } from "@/lib/pomodoro"
import { cn } from "@/lib/utils"
import type { CycleDotsProps, PomodoroPhase, PomodoroTimerProps } from "@/types/pomodoro"

function CycleDots({ filled, total }: CycleDotsProps) {
  return (
    <span aria-hidden className="flex gap-1.5">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={cn("size-2 rounded-full transition-colors", index < filled ? "bg-primary" : "bg-muted-foreground/25")} />
      ))}
    </span>
  )
}

export function PomodoroTimer({ pomodoro }: PomodoroTimerProps) {
  const { t } = useTranslation()
  const { state, remainingMs, progress } = pomodoro
  const { settings } = state
  const phases = settings.breaksEnabled ? POMODORO_PHASES : POMODORO_PHASES.filter((phase) => !isBreak(phase))
  const caption =
    state.status === "running" && state.endsAt !== null
      ? t("pomodoro.endsAt", { time: formatTime(new Date(state.endsAt)) })
      : state.status === "paused"
        ? t("pomodoro.paused")
        : t("pomodoro.ready")
  const position = cyclePosition(state)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 py-4">
      <SegmentedControl<PomodoroPhase>
        label={t("pomodoro.phaseSwitcher")}
        value={state.phase}
        options={phases.map((phase) => ({ value: phase, label: t(`pomodoro.phases.${phase}`) }))}
        onChange={(phase) => pomodoro.dispatch({ type: "select-phase", phase })}
      />
      <TimerRing progress={progress} tone={isBreak(state.phase) ? "break" : "focus"}>
        <span className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">{t(`pomodoro.phases.${state.phase}`)}</span>
        <span role="timer" aria-live="off" className="text-6xl font-extralight tracking-tight tabular-nums sm:text-7xl">
          {formatCountdown(remainingMs)}
        </span>
        <span className={cn("text-sm text-muted-foreground", state.status === "paused" && "animate-pulse")}>{caption}</span>
      </TimerRing>
      <TimerControls pomodoro={pomodoro} />
      <div className="flex flex-col items-center gap-2 text-center">
        <CycleDots filled={position.filled} total={position.total} />
        <p className="text-sm text-muted-foreground">
          {t("pomodoro.session", { current: position.current, total: position.total })}
          {settings.breaksEnabled && state.phase === "focus"
            ? ` · ${t("pomodoro.longBreakIn", { count: sessionsUntilLongBreak(state.cycle, settings.longBreakEvery) })}`
            : null}
        </p>
        <p className="max-w-xs text-xs text-muted-foreground/80">{t("pomodoro.trayHint")}</p>
      </div>
    </div>
  )
}
