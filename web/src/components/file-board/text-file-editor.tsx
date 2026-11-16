import { useTranslation } from "react-i18next"
import { PlainTextArea } from "@/components/file-board/plain-text-area"
import { SaveTextButton } from "@/components/file-board/save-text-button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useTextFileEditor } from "@/hooks/use-text-file-editor"
import { fileLabel } from "@/lib/file-board"
import type { TextFileEditorProps } from "@/types/file-board"

/** The text of a `.txt` file, editable in place like a plain text editor. */
export function TextFileEditor({ item, text, header }: TextFileEditorProps) {
  const { t } = useTranslation()
  const editor = useTextFileEditor(item, text)

  return (
    <Page {...header} actions={editor.dirty ? <SaveTextButton onSave={() => void editor.saveNow()} /> : null}>
      <PageSection>
        <PlainTextArea
          value={editor.value}
          label={t("fileBoard.fileContent", { title: fileLabel(item) })}
          onChange={editor.setValue}
          onSaveShortcut={() => void editor.saveNow()}
        />
      </PageSection>
    </Page>
  )
}
