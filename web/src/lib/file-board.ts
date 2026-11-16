import { i18n } from "@/lib/i18n"
import { BOARD_KINDS, FILE_KINDS, type FileItem, type FilePreviewKind } from "@/types/file-board"

const MIME_KINDS: Record<string, FilePreviewKind> = { "text/plain": "text", "text/markdown": "markdown", "text/x-markdown": "markdown" }
const UNKNOWN_MIMES = new Set(["", "application/octet-stream"])
const EXTENSION_KINDS: Record<string, FilePreviewKind> = { pdf: "pdf", txt: "text", md: "markdown", markdown: "markdown" }

/** Text files above this size are not loaded into the preview. */
export const TEXT_PREVIEW_LIMIT_BYTES = 2 * 1024 * 1024

export function getBoardKindOptions() {
  return BOARD_KINDS.map((value) => ({ value, label: i18n.t(`boardKinds.${value}`) }))
}

export function getFileKindOptions() {
  return FILE_KINDS.map((value) => ({ value, label: i18n.t(`fileKinds.${value}`) }))
}

export function isImage(item: FileItem) {
  return item.mime.startsWith("image/")
}

/** Lowercase extension of the file's title, or "" when it has none. */
export function fileExtension(item: FileItem) {
  const match = /\.([a-z0-9]+)$/i.exec(item.title ?? "")
  return match ? match[1].toLowerCase() : ""
}

/** How the file can be previewed: by mime type, or by extension when the mime is unknown (`.md` often has none). */
export function previewKind(item: FileItem): FilePreviewKind {
  const mime = item.mime.toLowerCase()
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  if (Object.hasOwn(MIME_KINDS, mime)) return MIME_KINDS[mime]
  return UNKNOWN_MIMES.has(mime) ? (EXTENSION_KINDS[fileExtension(item)] ?? "other") : "other"
}

export function hasPreviewPage(item: FileItem) {
  const kind = previewKind(item)
  return kind === "pdf" || kind === "text" || kind === "markdown"
}

/** `<base>.md`, or `<base> 2.md`, `<base> 3.md`… when the board already has a file with that name. */
export function newDocumentTitle(base: string, items: FileItem[]) {
  const taken = new Set(items.map((item) => item.title?.toLowerCase()))
  let title = `${base}.md`
  for (let count = 2; taken.has(title.toLowerCase()); count += 1) title = `${base} ${count}.md`
  return title
}

/** An empty markdown file, ready to upload as a new document. */
export function newMarkdownFile(title: string) {
  return new File([], title, { type: "text/markdown" })
}

export function fileLabel(item: FileItem) {
  return item.title || i18n.t("fileBoard.fileLabel", { kind: i18n.t(`fileKinds.${item.kind}`) })
}
