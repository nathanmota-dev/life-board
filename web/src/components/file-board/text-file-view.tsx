import { useTranslation } from "react-i18next"
import { FileWarning } from "lucide-react"
import { TextFileEditor } from "@/components/file-board/text-file-editor"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Page, PageSection } from "@/components/workspace-ui"
import { useFileText } from "@/hooks/queries/use-file-boards"
import { TEXT_PREVIEW_LIMIT_BYTES } from "@/lib/file-board"
import { formatBytes } from "@/lib/format"
import type { FileItemViewProps } from "@/types/file-board"

/** Loads a `.txt`/`.md` file and opens it in the plain text editor; files over the limit aren't loaded. */
export function TextFileView({ item, header }: FileItemViewProps) {
  const { t } = useTranslation()
  const tooLarge = item.sizeBytes > TEXT_PREVIEW_LIMIT_BYTES
  const text = useFileText(item, !tooLarge)

  return !tooLarge && text.data !== undefined ? (
    <TextFileEditor item={item} text={text.data} header={header} />
  ) : (
    <Page {...header}>
      <PageSection>
        <DataState
          isLoading={text.isLoading}
          error={text.error}
          isEmpty={tooLarge}
          empty={
            <EmptyState
              icon={FileWarning}
              title={t("fileBoard.tooLargeToPreview")}
              description={t("fileBoard.tooLargeDescription", { size: formatBytes(TEXT_PREVIEW_LIMIT_BYTES) })}
            />
          }
        >
          {null}
        </DataState>
      </PageSection>
    </Page>
  )
}
