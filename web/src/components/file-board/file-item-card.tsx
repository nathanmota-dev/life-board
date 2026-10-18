import { useTranslation } from "react-i18next"
import { FileThumbnail } from "@/components/file-board/file-thumbnail"
import { fileLabel } from "@/lib/file-board"
import { formatBytes, formatMoney } from "@/lib/format"
import type { FileItemCardProps } from "@/types/file-board"

export function FileItemCard({ item, onOpen }: FileItemCardProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-xs transition-colors hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <FileThumbnail item={item} className="aspect-[4/3] w-full border-b" />
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <span className="truncate text-sm font-medium">{fileLabel(item)}</span>
        <span className="truncate text-xs text-muted-foreground">
          {t(`fileKinds.${item.kind}`)} · {formatBytes(item.sizeBytes)}
          {item.amountCents !== null ? ` · ${formatMoney(item.amountCents, item.currency ?? "BRL")}` : ""}
        </span>
      </div>
    </button>
  )
}
