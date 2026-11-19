import { useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react"
import { PageTitleInput } from "@/components/pages/page-title-input"
import { PageTreeMenu } from "@/components/pages/page-tree-menu"
import { cn } from "@/lib/utils"
import type { PageTreeDraftRowProps, PageTreeItemProps, PageTreeListProps } from "@/types/page"

const INDENT_REM = 0.9

/** Moves the focus to the previous or next visible row of the tree. */
function focusSibling(row: HTMLElement, step: 1 | -1) {
  const rows = [...(row.closest('[role="tree"]')?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])]
  rows[rows.indexOf(row) + step]?.focus()
}

/** The row where the title of a new folder or page is typed. */
export function PageTreeDraftRow({ depth, kind, onSubmit, onCancel }: PageTreeDraftRowProps) {
  const { t } = useTranslation()
  const Icon = kind === "folder" ? Folder : FileText
  return (
    <li role="none">
      <div className="flex items-center gap-1.5 rounded-md px-2 py-1" style={{ paddingLeft: `${0.5 + depth * INDENT_REM}rem` }}>
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <PageTitleInput
          label={t(kind === "folder" ? "pages.newFolderTitle" : "pages.newPageTitle")}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </div>
    </li>
  )
}

/** A folder or page of the tree, with its children when it's an open folder. */
export function PageTreeItem(props: PageTreeItemProps) {
  const { node, depth, expanded, selectedId, renamingId, draft, actions, onSelect, onToggle } = props
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const isFolder = node.kind === "folder"
  const isOpen = isFolder && expanded.has(node.id)
  const renaming = renamingId === node.id
  const drag = useDraggable({ id: node.id, disabled: renaming })
  const drop = useDroppable({ id: node.id, disabled: !isFolder })
  const Icon = isFolder ? (isOpen ? FolderOpen : Folder) : FileText

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const row = event.currentTarget
    const handled = {
      Enter: () => onSelect(node),
      " ": () => onSelect(node),
      F2: () => actions.onRename(node.id),
      Delete: () => actions.onDelete(node),
      ContextMenu: () => setMenuOpen(true),
      ArrowDown: () => focusSibling(row, 1),
      ArrowUp: () => focusSibling(row, -1),
      ArrowRight: () => (isFolder && !isOpen ? onToggle(node.id) : focusSibling(row, 1)),
      ArrowLeft: () => (isOpen ? onToggle(node.id) : undefined),
    }[event.key]
    if (event.key === "F10" && event.shiftKey) setMenuOpen(true)
    else if (!handled) return
    else handled()
    event.preventDefault()
  }

  return (
    <li role="none">
      <div
        ref={(element) => {
          drag.setNodeRef(element)
          drop.setNodeRef(element)
        }}
        role="treeitem"
        tabIndex={0}
        aria-level={depth + 1}
        aria-expanded={isFolder ? isOpen : undefined}
        aria-selected={selectedId === node.id}
        aria-label={node.title}
        data-over={drop.isOver || undefined}
        className={cn(
          "group/row flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-1 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
          selectedId === node.id && "bg-primary/10 font-medium text-primary",
          drop.isOver && "bg-primary/20 ring-1 ring-primary",
          drag.isDragging && "relative z-10 opacity-70 shadow-md",
        )}
        style={{ paddingLeft: `${0.5 + depth * INDENT_REM}rem`, transform: CSS.Translate.toString(drag.transform) }}
        onClick={() => onSelect(node)}
        onDoubleClick={() => actions.onRename(node.id)}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenuOpen(true)
        }}
        onKeyDown={onKeyDown}
        {...drag.listeners}
      >
        {isFolder ? (
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} aria-hidden="true" />
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {renaming ? (
          <PageTitleInput
            initial={node.title}
            label={t("pages.renameLabel", { title: node.title })}
            onSubmit={(title) => props.onRenameSubmit(node.id, title)}
            onCancel={props.onRenameCancel}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
        )}
        {renaming ? null : <PageTreeMenu node={node} open={menuOpen} onOpenChange={setMenuOpen} actions={actions} />}
      </div>
      {isOpen && (node.children.length > 0 || draft?.parentId === node.id) ? (
        <ul role="group">
          {draft?.parentId === node.id ? (
            <PageTreeDraftRow depth={depth + 1} kind={draft.kind} onSubmit={props.onDraftSubmit} onCancel={props.onDraftCancel} />
          ) : null}
          {node.children.map((child) => (
            <PageTreeItem key={child.id} {...props} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** The root of the tree: a new item being named at the top level, then every folder and page. */
export function PageTreeList({ tree, ...shared }: PageTreeListProps) {
  const { t } = useTranslation()
  return (
    <ul role="tree" aria-label={t("navigation.pages")} className="flex flex-col gap-0.5">
      {shared.draft?.parentId === null ? (
        <PageTreeDraftRow depth={0} kind={shared.draft.kind} onSubmit={shared.onDraftSubmit} onCancel={shared.onDraftCancel} />
      ) : null}
      {tree.map((node) => (
        <PageTreeItem key={node.id} {...shared} node={node} depth={0} />
      ))}
    </ul>
  )
}
