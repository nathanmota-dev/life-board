import { PlainTextArea } from "@/components/file-board/plain-text-area"
import { SaveTextButton } from "@/components/file-board/save-text-button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useTextFileEditor } from "@/hooks/use-text-file-editor"
import type { TextFileEditorProps } from "@/types/file-board"

/** The text of a `.txt` file, editable in place like a plain text editor. */
export function TextFileEditor({ item, text, header }: TextFileEditorProps) {
  const editor = useTextFileEditor(item, text)

  return (
    <Page {...header} actions={editor.dirty ? <SaveTextButton onSave={() => void editor.saveNow()} /> : null}>
      <PageSection>
        <PlainTextArea {...editor.field} />
      </PageSection>
    </Page>
  )
}
