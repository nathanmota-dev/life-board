import { i18n } from "@/lib/i18n"
import { BOARD_KINDS, FILE_KINDS, type FileItem } from "@/types/file-board"

export function getBoardKindOptions() {
  return BOARD_KINDS.map((value) => ({ value, label: i18n.t(`boardKinds.${value}`) }))
}

export function getFileKindOptions() {
  return FILE_KINDS.map((value) => ({ value, label: i18n.t(`fileKinds.${value}`) }))
}

export function isImage(item: FileItem) {
  return item.mime.startsWith("image/")
}

export function fileLabel(item: FileItem) {
  return item.title || i18n.t("fileBoard.fileLabel", { kind: i18n.t(`fileKinds.${item.kind}`) })
}
