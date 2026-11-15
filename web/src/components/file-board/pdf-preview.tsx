import { Skeleton } from "@/components/ui/skeleton"
import { useFileUrl } from "@/hooks/queries/use-file-boards"
import { fileLabel } from "@/lib/file-board"
import type { FilePreviewProps } from "@/types/file-board"

/** The PDF is only downloaded here, by Chromium's built-in viewer, never in the board grid. */
export function PdfPreview({ item }: FilePreviewProps) {
  const url = useFileUrl(item)
  return url.data ? (
    <iframe src={url.data} title={fileLabel(item)} className="h-[calc(100dvh-14rem)] min-h-96 w-full rounded-2xl border bg-card" />
  ) : (
    <Skeleton className="h-[calc(100dvh-14rem)] min-h-96 w-full rounded-2xl" />
  )
}
