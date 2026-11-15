import { File, FileText, FileType } from "lucide-react"
import { useFileUrl } from "@/hooks/queries/use-file-boards"
import { fileExtension, fileLabel, previewKind } from "@/lib/file-board"
import { cn } from "@/lib/utils"
import type { FileThumbnailProps } from "@/types/file-board"

const ICONS = {
  image: { icon: File, className: "text-muted-foreground" },
  text: { icon: FileText, className: "text-muted-foreground" },
  pdf: { icon: FileType, className: "text-chart-1" },
  other: { icon: File, className: "text-muted-foreground" },
}

export function FileThumbnail({ item, className }: FileThumbnailProps) {
  const url = useFileUrl(item)
  const kind = previewKind(item)
  const { icon: Icon, className: iconClassName } = ICONS[kind]
  const extension = fileExtension(item)

  return (
    <div className={cn("flex items-center justify-center overflow-hidden bg-muted", className)}>
      {kind === "image" && url.data ? (
        <img src={url.data} alt={fileLabel(item)} loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1.5" data-preview-kind={kind}>
          <Icon className={cn("size-8", iconClassName)} strokeWidth={1.5} aria-hidden="true" />
          {extension ? (
            <span className="rounded-md border bg-card px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {extension}
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}
