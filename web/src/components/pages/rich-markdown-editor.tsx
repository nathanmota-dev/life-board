import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { EditorContent, useEditor } from "@tiptap/react"
import { isSaveShortcut } from "@/lib/keyboard"
import { markdownExtensions, matchFileEnding } from "@/lib/markdown-editor"
import { cn } from "@/lib/utils"
import type { RichMarkdownEditorProps } from "@/types/page"

/**
 * A `.md` file formatted as it's typed (`# ` makes a heading, `- ` a list, `**bold**` bold),
 * handing back markdown on every change. The text is read once, when it mounts.
 */
export function RichMarkdownEditor({ value, label, onChange, onSaveShortcut, className }: RichMarkdownEditorProps) {
  const { t } = useTranslation()
  const [original] = useState(value)
  const callbacks = useRef({ onChange, onSaveShortcut })
  useEffect(() => {
    callbacks.current = { onChange, onSaveShortcut }
  }, [onChange, onSaveShortcut])

  const editor = useEditor({
    extensions: markdownExtensions(t("pages.markdownPlaceholder")),
    content: original,
    contentType: "markdown",
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class: "markdown-content min-h-full outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (!isSaveShortcut(event)) return false
        event.preventDefault()
        callbacks.current.onSaveShortcut()
        return true
      },
    },
    onUpdate: ({ editor: current }) => callbacks.current.onChange(matchFileEnding(current.getMarkdown(), original)),
  })

  return (
    <div
      className={cn(
        "h-[calc(100dvh-14rem)] min-h-40 cursor-text overflow-y-auto rounded-2xl border bg-card p-5 focus-within:ring-2 focus-within:ring-ring/50 [&>div]:min-h-full",
        className,
      )}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        editor.commands.focus("end")
      }}
    >
      <EditorContent editor={editor} className="min-h-full" />
    </div>
  )
}
