import { lazy, Suspense } from "react"
import { DataState } from "@/components/shared/data-state"
import { Page, PageSection } from "@/components/workspace-ui"
import type { TextFileEditorProps } from "@/types/file-board"

// The editor library only loads when a `.md` file is opened.
const MarkdownFileEditor = lazy(() => import("@/components/file-board/markdown-file-editor"))

export function LazyMarkdownFileEditor(props: TextFileEditorProps) {
  return (
    <Suspense
      fallback={
        <Page {...props.header}>
          <PageSection>
            <DataState isLoading error={null}>
              {null}
            </DataState>
          </PageSection>
        </Page>
      }
    >
      <MarkdownFileEditor {...props} />
    </Suspense>
  )
}
