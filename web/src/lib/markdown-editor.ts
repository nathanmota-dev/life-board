import { Editor, type Extensions } from "@tiptap/core"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { Placeholder } from "@tiptap/extensions"
import { Markdown } from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"

/**
 * What the formatted `.md` editor understands: the CommonMark blocks and marks, task lists
 * and links (which never navigate, since the window can't). Tables, images and raw HTML are
 * left out on purpose: a file that uses them fails `roundTripsCleanly` and opens as source.
 */
export function markdownExtensions(placeholder = ""): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: false, autolink: false, linkOnPaste: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
    Markdown.configure({ markedOptions: { gfm: true }, indentation: { style: "space", size: 2 } }),
  ]
}

/** The text without the differences the editor can't keep and that don't change it: line endings and blank lines at the end. */
export function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n?/g, "\n").replace(/\n+$/, "")
}

/** The editor's markdown with the original file's line endings and final newline, so a save changes only what was edited. */
export function matchFileEnding(markdown: string, original: string) {
  const crlf = original.includes("\r\n")
  const ending = /(\r?\n)+$/.exec(original)?.[0] ?? ""
  const body = normalizeMarkdown(markdown)
  return (crlf ? body.replace(/\n/g, "\r\n") : body) + ending
}

/** The file's markdown after it went through the editor, as the formatted editor would save it. */
export function serializeThroughEditor(markdown: string) {
  const editor = new Editor({ extensions: markdownExtensions(), content: markdown, contentType: "markdown" })
  try {
    return editor.getMarkdown()
  } finally {
    editor.destroy()
  }
}

/** Whether the formatted editor keeps the file as it is, so editing it there rewrites nothing else. */
export function roundTripsCleanly(markdown: string) {
  try {
    return normalizeMarkdown(serializeThroughEditor(markdown)) === normalizeMarkdown(markdown)
  } catch {
    return false
  }
}
