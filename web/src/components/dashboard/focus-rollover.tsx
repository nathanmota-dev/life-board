import { useTranslation } from "react-i18next"
import { History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSetFocusDays } from "@/hooks/queries/use-tasks"
import { planFocusRollover } from "@/lib/dashboard"
import { errorMessage } from "@/lib/format"
import type { FocusRolloverProps } from "@/types/dashboard"

/** Offers yesterday's unfinished focus tasks for today instead of carrying them over silently. */
export function FocusRollover({ today, unfinished, freeSlots }: FocusRolloverProps) {
  const { t } = useTranslation()
  const setFocus = useSetFocusDays()
  const { keep, drop } = planFocusRollover(unfinished, freeSlots)
  const leave = (tasks: typeof unfinished) => tasks.map((task) => ({ id: task.id, focusDay: null }))

  return (
    <section aria-label={t("dashboard.keepYesterday")} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <History className="size-4 text-primary" />
        {t("dashboard.keepYesterday")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.unfinishedYesterday", { count: unfinished.length })}</p>
      <ul className="mt-2 flex flex-col gap-0.5 pl-6 text-sm">
        {unfinished.map((task) => (
          <li key={task.id} className="list-disc truncate">
            {task.title}
          </li>
        ))}
      </ul>
      {drop.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">{t("dashboard.rolloverNoRoom", { count: drop.length })}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={setFocus.isPending || keep.length === 0}
          onClick={() => setFocus.mutate([...keep.map((task) => ({ id: task.id, focusDay: today })), ...leave(drop)])}
        >
          {t("dashboard.keepFocus")}
        </Button>
        <Button size="sm" variant="ghost" disabled={setFocus.isPending} onClick={() => setFocus.mutate(leave(unfinished))}>
          {t("dashboard.startFresh")}
        </Button>
      </div>
      {setFocus.error ? <p role="alert" className="mt-2 text-sm text-destructive">{errorMessage(setFocus.error)}</p> : null}
    </section>
  )
}
