import { useTranslation } from "react-i18next"
import { PartyPopper, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { InboxZeroProps } from "@/types/inbox"

export function InboxZero({ count, canUndo, onUndo, onExit }: InboxZeroProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <PartyPopper className="size-6" strokeWidth={1.7} />
      </span>
      <div>
        <h2 className="text-lg font-semibold">{t("inbox.zero")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("inbox.triagedCount", { count })}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" size="sm" disabled={!canUndo} onClick={onUndo}>
          <Undo2 />
          {t("inbox.undo")}
        </Button>
        <Button size="sm" onClick={onExit}>
          {t("inbox.backToInbox")}
        </Button>
      </div>
    </div>
  )
}
