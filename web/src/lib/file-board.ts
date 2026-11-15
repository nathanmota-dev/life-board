import { i18n } from "@/lib/i18n"
import { BOARD_KINDS, FILE_KINDS, type FileItem, type FilePreviewKind } from "@/types/file-board"

const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/x-markdown"])
const UNKNOWN_MIMES = new Set(["", "application/octet-stream"])
const EXTENSION_KINDS: Record<string, FilePreviewKind> = { pdf: "pdf", txt: "text", md: "text", markdown: "text" }

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
  if (TEXT_MIMES.has(mime)) return "text"
  return UNKNOWN_MIMES.has(mime) ? (EXTENSION_KINDS[fileExtension(item)] ?? "other") : "other"
}

export function hasPreviewPage(item: FileItem) {
  const kind = previewKind(item)
  return kind === "pdf" || kind === "text"
}

export function fileLabel(item: FileItem) {
  return item.title || i18n.t("fileBoard.fileLabel", { kind: i18n.t(`fileKinds.${item.kind}`) })
}
