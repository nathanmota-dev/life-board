import { useTranslation } from "react-i18next"
import { useRef } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUploadFile } from "@/hooks/queries/use-file-boards"
import { errorMessage } from "@/lib/format"
import type { UploadButtonProps } from "@/types/file-board"

export function UploadButton({ boardId }: UploadButtonProps) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadFile()

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-label={t("fileBoard.filesToUpload")}
        onChange={(event) => {
          for (const file of event.target.files ?? []) upload.mutate({ boardId, file, title: file.name })
          event.target.value = ""
        }}
      />
      <Button size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
        <Upload />
        {upload.isPending ? t("fileBoard.uploading") : t("fileBoard.upload")}
      </Button>
      {upload.error ? <p role="alert" className="max-w-64 text-xs text-destructive">{errorMessage(upload.error)}</p> : null}
    </>
  )
}
