import { PdfPreview } from "@/components/file-board/pdf-preview"
import { Page, PageSection } from "@/components/workspace-ui"
import type { FileItemViewProps } from "@/types/file-board"

export function PdfFileView({ item, header }: FileItemViewProps) {
  return (
    <Page {...header}>
      <PageSection>
        <PdfPreview item={item} />
      </PageSection>
    </Page>
  )
}
