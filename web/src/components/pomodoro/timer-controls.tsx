import { useTranslation } from "react-i18next"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TimerControlsProps } from "@/types/pomodoro"

export function TimerControls({ pomodoro }: TimerControlsProps) {
  const { t } = useTranslation()
  const { status } = pomodoro.state
  const running = status === "running"
  const toggleLabel = running ? t("pomodoro.pause") : status === "paused" ? t("pomodoro.resume") : t("pomodoro.start")

  return (
    <div className="flex items-center gap-2.5">
      <Button
        size="lg"
        className="min-w-32 cursor-pointer rounded-full shadow-md shadow-primary/20"
        onClick={() => pomodoro.dispatch({ type: "toggle" })}
      >
        {running ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        {toggleLabel}
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="cursor-pointer rounded-full"
        disabled={status === "idle"}
        onClick={() => pomodoro.dispatch({ type: "reset" })}
      >
        <RotateCcw />
        {t("pomodoro.reset")}
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={t("pomodoro.skip")}
        title={t("pomodoro.skip")}
        className="cursor-pointer rounded-full text-muted-foreground"
        onClick={() => pomodoro.dispatch({ type: "skip" })}
      >
        <SkipForward />
      </Button>
    </div>
  )
}
