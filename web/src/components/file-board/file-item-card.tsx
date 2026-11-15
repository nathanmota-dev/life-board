import { useTranslation } from "react-i18next"
import { useNavigate } from "@tanstack/react-router"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { FileThumbnail } from "@/components/file-board/file-thumbnail"
import { Button } from "@/components/ui/button"
import { useRemoveFileItem } from "@/hooks/queries/use-file-boards"
import { fileLabel, hasPreviewPage, isImage } from "@/lib/file-board"
import { errorMessage, formatBytes, formatMoney } from "@/lib/format"
import type { FileItemCardProps } from "@/types/file-board"

export function FileItemCard({ item, onOpen, onPreviewImage }: FileItemCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const remove = useRemoveFileItem()
  const label = fileLabel(item)

  function preview() {
    if (isImage(item)) onPreviewImage(item)
    else if (hasPreviewPage(item)) void navigate({ to: "/file-board/$boardId/$itemId", params: { boardId: item.boardId, itemId: item.id } })
    else onOpen(item)
  }

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs">
      <button
        type="button"
        onClick={preview}
        aria-label={t("fileBoard.openFile", { title: label })}
        className="cursor-pointer border-b transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <FileThumbnail item={item} className="aspect-[4/3] w-full" />
      </button>
      <div className="flex items-center gap-1 py-2 pr-2 pl-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="truncate text-xs text-muted-foreground">
            {t(`fileKinds.${item.kind}`)} · {formatBytes(item.sizeBytes)}
            {item.amountCents !== null ? ` · ${formatMoney(item.amountCents, item.currency ?? "BRL")}` : ""}
          </span>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t("fileBoard.editFile", { title: label })}
          onClick={() => onOpen(item)}
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t("common.deleteItem", { title: label })}
          disabled={remove.isPending}
          onClick={() => remove.mutate(item.id, { onError: (error) => toast.error(errorMessage(error)) })}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
