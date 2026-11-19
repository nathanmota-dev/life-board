import type { Dispatch, SetStateAction } from "react"

export type PageKind = "folder" | "page"

/** A folder or a markdown page, as the API lists it (without content). */
export type Page = {
  id: string
  parentId: string | null
  kind: PageKind
  title: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

export type PageNode = Page & { children: PageNode[] }

export type PageContent = { content: string; updatedAt: string }

export type PageInput = { kind: PageKind; title: string; parentId?: string | null; content?: string }

export type PageUpdate = { title?: string; parentId?: string | null }

export type PageImportInput = { file: File; parentId?: string | null; folderPath?: string }

/** A file chosen for import: the `webkitRelativePath` is empty unless a folder was picked. */
export type ImportableFile = File & { webkitRelativePath: string }

export type ImportSummary = { imported: number; skipped: number }

/** How a `.md` page is edited: formatted as it's typed, or as its markdown source. */
export type MarkdownMode = "rich" | "source"

export type PlainTextAreaProps = {
  value: string
  label: string
  onChange: (value: string) => void
  onSaveShortcut: () => void
  /** Overrides the editor box's size, such as when it shares the page with a notice. */
  className?: string
}

export type RichMarkdownEditorProps = PlainTextAreaProps

export type MarkdownModeToggleProps = { mode: MarkdownMode; onChange: (mode: MarkdownMode) => void }

export type MarkdownSourceNoticeProps = { onEditFormatted: () => void }

export type MarkdownEditorBodyProps = PlainTextAreaProps & { mode: MarkdownMode; lossy: boolean; onEditFormatted: () => void }

/** What `useAutosavedText` needs: the text it starts from and how to persist one. */
export type AutosavedTextOptions = {
  text: string
  save: (content: string) => Promise<unknown>
  savedMessage: string
  alreadySavedMessage: string
}

export type AutosavedText = {
  value: string
  setValue: Dispatch<SetStateAction<string | null>>
  dirty: boolean
  saveNow: () => Promise<void>
}

export type PageEditorState = AutosavedText & { field: PlainTextAreaProps }

export type PageEditorProps = { editor: PageEditorState }

export type PageDocumentProps = { page: Page; content: string; initialEditing: boolean }

export type PageHeaderProps = {
  page: Page
  ancestors: Page[]
  editing: boolean
  dirty: boolean
  onToggleEditing: () => void
  onSave: () => void
  onRename: (title: string) => void
  onDownload: () => void
}

export type PageReaderProps = { markdown: string }

export type PageTitleInputProps = {
  initial?: string
  label: string
  onSubmit: (title: string) => void
  onCancel: () => void
}

/** The folder (or root) a new item is created in, and what it is. */
export type PageDraft = { parentId: string | null; kind: PageKind }

export type PageMenuActions = {
  onNewPage: (folderId: string) => void
  onNewFolder: (folderId: string) => void
  onRename: (id: string) => void
  onMove: (node: Page) => void
  onDelete: (node: Page) => void
  onDownload: (node: Page) => void
}

export type PageTreeProps = {
  /** Called after a page is opened, such as to close the sheet the tree sits in. */
  onOpenPage?: () => void
}

export type PageTreeItemProps = {
  node: PageNode
  depth: number
  expanded: ReadonlySet<string>
  selectedId: string | null
  renamingId: string | null
  draft: PageDraft | null
  actions: PageMenuActions
  onSelect: (node: Page) => void
  onToggle: (id: string) => void
  onRenameSubmit: (id: string, title: string) => void
  onRenameCancel: () => void
  onDraftSubmit: (title: string) => void
  onDraftCancel: () => void
}

export type PageTreeDropZoneProps = { onDrop: (activeId: string, overId: string | null) => void; children: React.ReactNode }

export type PageTreeListProps = Omit<PageTreeItemProps, "node" | "depth"> & { tree: PageNode[] }

export type PageTreeDraftRowProps = {
  depth: number
  kind: PageKind
  onSubmit: (title: string) => void
  onCancel: () => void
}

export type PageTreeToolbarProps = {
  parentId: string | null
  allExpanded: boolean
  onNewPage: () => void
  onNewFolder: () => void
  onCollapseAll: () => void
  onImported: (parentId: string | null) => void
}

export type PageTreeMenuProps = {
  node: Page
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: PageMenuActions
}

export type PageMoveDialogProps = {
  node: Page | null
  onClose: () => void
  onMove: (node: Page, parentId: string | null) => void
}

export type PageDeleteDialogProps = {
  node: Page | null
  onClose: () => void
  onDelete: (node: Page) => void
}

export type PageImportButtonProps = { parentId: string | null; onImported: (parentId: string | null) => void }

export type PagesLayoutProps = { children: React.ReactNode }
