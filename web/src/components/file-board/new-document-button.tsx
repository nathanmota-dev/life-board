import { useTranslation } from "react-i18next"
import { useNavigate } from "@tanstack/react-router"
import { FilePlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useUploadFile } from "@/hooks/queries/use-file-boards"
import { newDocumentTitle, newMarkdownFile } from "@/lib/file-board"
import { errorMessage } from "@/lib/format"
import type { NewDocumentButtonProps } from "@/types/file-board"

/** Creates an empty `.md` file in the board and opens it in the editor. */
export function NewDocumentButton({ boardId, items }: NewDocumentButtonProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const upload = useUploadFile()

  function create() {
    const title = newDocumentTitle(t("fileBoard.untitled"), items)
    upload.mutate(
      { boardId, file: newMarkdownFile(title), title, kind: "note" },
      {
        onSuccess: (item) =>
          void navigate({ to: "/file-board/$boardId/$itemId", params: { boardId: item.boardId, itemId: item.id } }),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <Button size="sm" variant="outline" disabled={upload.isPending} onClick={create}>
      <FilePlus />
      {upload.isPending ? t("fileBoard.creatingDocument") : t("fileBoard.newDocument")}
    </Button>
  )
}
