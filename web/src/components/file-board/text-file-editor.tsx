import { useTranslation } from "react-i18next"
import { SaveTextButton } from "@/components/file-board/save-text-button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useTextFileEditor } from "@/hooks/use-text-file-editor"
import { fileLabel } from "@/lib/file-board"
import type { TextFileEditorProps } from "@/types/file-board"

/** The text of a `.txt`/`.md` file, editable in place like a plain text editor. */
export function TextFileEditor({ item, text, header }: TextFileEditorProps) {
  const { t } = useTranslation()
  const editor = useTextFileEditor(item, text)

  return (
    <Page {...header} actions={editor.dirty ? <SaveTextButton onSave={() => void editor.saveNow()} /> : null}>
      <PageSection>
        <textarea
          value={editor.value}
          onChange={(event) => editor.setValue(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault()
              void editor.saveNow()
            }
          }}
          aria-label={t("fileBoard.fileContent", { title: fileLabel(item) })}
          spellCheck={false}
          className="block h-[calc(100dvh-14rem)] min-h-40 w-full resize-none rounded-2xl border bg-card p-5 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </PageSection>
    </Page>
  )
}
