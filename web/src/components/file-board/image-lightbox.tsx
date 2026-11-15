import { useTranslation } from "react-i18next"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useFileUrl } from "@/hooks/queries/use-file-boards"
import { fileLabel } from "@/lib/file-board"
import type { FilePreviewProps, ImageLightboxProps } from "@/types/file-board"

function LightboxImage({ item }: FilePreviewProps) {
  const url = useFileUrl(item)
  return url.data ? (
    <img src={url.data} alt={fileLabel(item)} className="max-h-[80vh] w-full rounded-xl bg-muted object-contain" />
  ) : null
}

export function ImageLightbox({ item, onClose }: ImageLightboxProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6 leading-normal">{item ? fileLabel(item) : t("fileBoard.file")}</DialogTitle>
          <DialogDescription className="sr-only">{t("fileBoard.imagePreview")}</DialogDescription>
        </DialogHeader>
        {item ? <LightboxImage key={item.id} item={item} /> : null}
      </DialogContent>
    </Dialog>
  )
}
