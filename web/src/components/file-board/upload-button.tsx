import { useRef } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUploadFile } from "@/hooks/queries/use-file-boards"
import type { UploadButtonProps } from "@/types/file-board"

export function UploadButton({ boardId }: UploadButtonProps) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadFile()

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-label="Files to upload"
        onChange={(event) => {
          for (const file of event.target.files ?? []) upload.mutate({ boardId, file, title: file.name })
          event.target.value = ""
        }}
      />
      <Button size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
        <Upload />
        {upload.isPending ? "Uploading…" : "Upload"}
      </Button>
    </>
  )
}
