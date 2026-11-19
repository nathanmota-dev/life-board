import { useTranslation } from "react-i18next"
import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { MarkdownSourceNoticeProps } from "@/types/page"

/** Says why a `.md` file opened as source: the formatted editor would change parts of it. */
export function MarkdownSourceNotice({ onEditFormatted }: MarkdownSourceNoticeProps) {
  const { t } = useTranslation()
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/50 px-4 py-3 text-sm">
      <Info className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-muted-foreground">{t("pages.markdownSourceNotice")}</p>
      <Button type="button" size="sm" variant="outline" onClick={onEditFormatted}>
        {t("pages.editFormattedAnyway")}
      </Button>
    </div>
  )
}
