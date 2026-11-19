import { useState } from "react"
import { MarkdownModeToggle } from "@/components/pages/markdown-mode-toggle"
import { MarkdownSourceNotice } from "@/components/pages/markdown-source-notice"
import { PlainTextArea } from "@/components/pages/plain-text-area"
import { RichMarkdownEditor } from "@/components/pages/rich-markdown-editor"
import { roundTripsCleanly } from "@/lib/markdown-editor"
import type { MarkdownEditorBodyProps, MarkdownMode, PageEditorProps } from "@/types/page"

/** The editor fills what the notice leaves, so the page itself never scrolls. */
const FILL = "h-auto min-h-0 flex-1"

function MarkdownEditorBody({ mode, lossy, onEditFormatted, ...field }: MarkdownEditorBodyProps) {
  return (
    <div className="flex min-h-40 flex-1 flex-col gap-3">
      {lossy ? <MarkdownSourceNotice onEditFormatted={onEditFormatted} /> : null}
      {mode === "rich" ? <RichMarkdownEditor {...field} className={FILL} /> : <PlainTextArea {...field} className={FILL} />}
    </div>
  )
}

/**
 * A page's markdown, formatted as it's typed or as source. A page the formatted editor would
 * rewrite (tables, images, HTML, other list markers…) opens as source, so it only changes
 * when the person chooses the formatted editor.
 */
export default function PageEditor({ editor }: PageEditorProps) {
  const [lossy, setLossy] = useState(() => !roundTripsCleanly(editor.value))
  const [mode, setMode] = useState<MarkdownMode>(lossy ? "source" : "rich")
  const changeMode = (next: MarkdownMode) => {
    if (next === "rich") setLossy(false)
    setMode(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <MarkdownModeToggle mode={mode} onChange={changeMode} />
      </div>
      <MarkdownEditorBody {...editor.field} mode={mode} lossy={lossy} onEditFormatted={() => changeMode("rich")} />
    </div>
  )
}
