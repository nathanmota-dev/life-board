import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "@tanstack/react-router"
import { FileQuestion } from "lucide-react"
import { PdfFileView } from "@/components/file-board/pdf-file-view"
import { TextFileView } from "@/components/file-board/text-file-view"
import { BackButton } from "@/components/shared/back-button"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Page, PageSection } from "@/components/workspace-ui"
import { useFileItems } from "@/hooks/queries/use-file-boards"
import { fileLabel, previewKind } from "@/lib/file-board"
import { formatBytes } from "@/lib/format"
import type { FileItemContentProps, FileItemViewProps } from "@/types/file-board"

function FileItemView({ item, header }: FileItemViewProps) {
  const View = previewKind(item) === "pdf" ? PdfFileView : TextFileView
  return <View item={item} header={header} />
}

/** A text or PDF file of a board, opened on its own page. */
export function FileItemContent({ boardId, itemId }: FileItemContentProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const items = useFileItems(boardId)
  const item = items.data?.find((file) => file.id === itemId)
  const header = {
    title: item ? fileLabel(item) : t("navigation.file-item"),
    description: item ? `${item.mime} · ${formatBytes(item.sizeBytes)}` : undefined,
    leading: <BackButton onClick={() => void navigate({ to: "/file-board", search: { board: boardId } })} />,
  }

  return item ? (
    <FileItemView key={item.id} item={item} header={header} />
  ) : (
    <Page {...header}>
      <PageSection>
        <DataState
          isLoading={items.isLoading}
          error={items.error}
          isEmpty
          empty={<EmptyState icon={FileQuestion} title={t("fileBoard.notFound")} description={t("fileBoard.notFoundDescription")} />}
        >
          {null}
        </DataState>
      </PageSection>
    </Page>
  )
}

export function FileItemPage() {
  const { boardId = "", itemId = "" } = useParams({ strict: false })
  return <FileItemContent boardId={boardId} itemId={itemId} />
}
