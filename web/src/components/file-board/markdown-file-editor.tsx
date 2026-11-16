import { useState } from "react"
import { useTranslation } from "react-i18next"
import { MarkdownModeToggle } from "@/components/file-board/markdown-mode-toggle"
import { MarkdownSourceNotice } from "@/components/file-board/markdown-source-notice"
import { PlainTextArea } from "@/components/file-board/plain-text-area"
import { RichMarkdownEditor } from "@/components/file-board/rich-markdown-editor"
import { SaveTextButton } from "@/components/file-board/save-text-button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useTextFileEditor } from "@/hooks/use-text-file-editor"
import { fileLabel } from "@/lib/file-board"
import { roundTripsCleanly } from "@/lib/markdown-editor"
import type { MarkdownEditorBodyProps, MarkdownMode, TextFileEditorProps } from "@/types/file-board"

/** The editor fills what the notice leaves, so the page itself never scrolls. */
const FILL = "h-auto min-h-0 flex-1"

function MarkdownEditorBody({ mode, lossy, onEditFormatted, ...field }: MarkdownEditorBodyProps) {
  return (
    <div className="flex h-[calc(100dvh-14rem)] min-h-40 flex-col gap-3">
      {lossy ? <MarkdownSourceNotice onEditFormatted={onEditFormatted} /> : null}
      {mode === "rich" ? <RichMarkdownEditor {...field} className={FILL} /> : <PlainTextArea {...field} className={FILL} />}
    </div>
  )
}

/**
 * A `.md` file, formatted as it's typed or as markdown source, saved like any text file.
 * A file the formatted editor would rewrite (tables, images, HTML, other list markers…)
 * opens as source, so it only changes when the person chooses the formatted editor.
 */
export default function MarkdownFileEditor({ item, text, header }: TextFileEditorProps) {
  const { t } = useTranslation()
  const editor = useTextFileEditor(item, text)
  const [lossy, setLossy] = useState(() => !roundTripsCleanly(text))
  const [mode, setMode] = useState<MarkdownMode>(lossy ? "source" : "rich")
  const changeMode = (next: MarkdownMode) => {
    if (next === "rich") setLossy(false)
    setMode(next)
  }

  return (
    <Page
      {...header}
      actions={
        <>
          <MarkdownModeToggle mode={mode} onChange={changeMode} />
          {editor.dirty ? <SaveTextButton onSave={() => void editor.saveNow()} /> : null}
        </>
      }
    >
      <PageSection>
        <MarkdownEditorBody
          mode={mode}
          lossy={lossy}
          onEditFormatted={() => changeMode("rich")}
          value={editor.value}
          label={t("fileBoard.fileContent", { title: fileLabel(item) })}
          onChange={editor.setValue}
          onSaveShortcut={() => void editor.saveNow()}
        />
      </PageSection>
    </Page>
  )
}
