import { FileText } from "lucide-react"
import { useFileUrl } from "@/hooks/queries/use-file-boards"
import { fileLabel, isImage } from "@/lib/file-board"
import { cn } from "@/lib/utils"
import type { FileThumbnailProps } from "@/types/file-board"

export function FileThumbnail({ item, className }: FileThumbnailProps) {
  const url = useFileUrl(item.id)

  return (
    <div className={cn("flex items-center justify-center overflow-hidden bg-muted", className)}>
      {isImage(item) && url.data ? (
        <img src={url.data} alt={fileLabel(item)} loading="lazy" className="size-full object-cover" />
      ) : (
        <FileText className="size-8 text-muted-foreground" strokeWidth={1.5} />
      )}
    </div>
  )
}
