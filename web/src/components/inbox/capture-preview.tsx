import { useTranslation } from "react-i18next"
import { CalendarDays, Flag, Hash, X } from "lucide-react"
import { captureTokenLabel } from "@/lib/capture"
import type { CapturePreviewProps, CaptureTokenKind } from "@/types/inbox"

const ICONS: Record<CaptureTokenKind, typeof Hash> = { tag: Hash, priority: Flag, due: CalendarDays }

/** The parts the quick capture recognized; removing one keeps its text in the title. */
export function CapturePreview({ tokens, onRemove }: CapturePreviewProps) {
  const { t } = useTranslation()

  return (
    <ul aria-label={t("inbox.recognized")} className="flex flex-wrap gap-1.5">
      {tokens.map((token) => ({ token, Icon: ICONS[token.kind] })).map(({ token, Icon }) => (
        <li
          key={`${token.start}-${token.text}`}
          className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 py-0.5 pr-0.5 pl-2 text-xs text-primary"
        >
          <Icon className="size-3" />
          {captureTokenLabel(token)}
          <button
            type="button"
            aria-label={t("inbox.keepAsText", { text: token.text })}
            className="flex size-5 cursor-pointer items-center justify-center rounded text-primary/70 hover:bg-primary/10 hover:text-primary"
            onClick={() => onRemove(token)}
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  )
}
