export const BOARD_KINDS = ["receipts", "photos", "invoices", "notes", "other"] as const
export const FILE_KINDS = ["image", "receipt", "invoice", "note", "other"] as const

export type BoardKind = (typeof BOARD_KINDS)[number]
export type FileKind = (typeof FILE_KINDS)[number]

export type FileBoard = {
  id: string
  name: string
  description: string | null
  kind: BoardKind
  color: string
  createdAt: string
  updatedAt: string
}

export type FileItem = {
  id: string
  boardId: string
  kind: FileKind
  title: string | null
  notes: string | null
  mime: string
  sizeBytes: number
  amountCents: number | null
  currency: string | null
  tags: string[]
  createdAt: string
}

export type FileBoardInput = { name: string; description?: string | null; kind?: BoardKind; color?: string }

export type FileItemUpdate = { title?: string | null; notes?: string | null; kind?: FileKind }

export type FileUploadInput = { boardId: string; file: File; title?: string; kind?: FileKind }

export type BoardListProps = { boards: FileBoard[]; selectedId: string | null; onSelect: (id: string) => void }

export type BoardFormDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (board: FileBoard) => void }

export type BoardFilesProps = { board: FileBoard; onDeleted: () => void }

export type FileItemGridProps = { items: FileItem[]; onOpen: (item: FileItem) => void }

export type FileItemCardProps = { item: FileItem; onOpen: (item: FileItem) => void }

export type FileThumbnailProps = { item: FileItem; className?: string }

export type FileItemDialogProps = { item: FileItem | null; onClose: () => void }

export type FileItemFormProps = { item: FileItem; onClose: () => void }

export type UploadButtonProps = { boardId: string }
