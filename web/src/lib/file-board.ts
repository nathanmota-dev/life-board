import { capitalize } from "@/lib/format"
import { BOARD_KINDS, FILE_KINDS, type FileItem } from "@/types/file-board"

export const BOARD_KIND_OPTIONS = BOARD_KINDS.map((value) => ({ value, label: capitalize(value) }))

export const FILE_KIND_OPTIONS = FILE_KINDS.map((value) => ({ value, label: capitalize(value) }))

export function isImage(item: FileItem) {
  return item.mime.startsWith("image/")
}

export function fileLabel(item: FileItem) {
  return item.title || `${capitalize(item.kind)} file`
}
