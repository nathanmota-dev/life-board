import { Pencil, Pin, PinOff, Trash2 } from "lucide-react"
import { RowActions } from "@/components/shared/row-actions"
import { StatusBadge } from "@/components/shared/status-badge"
import { TagList } from "@/components/shared/tag-list"
import { useRemoveThought, useUpdateThought } from "@/hooks/queries/use-thoughts"
import { formatRelativeDay } from "@/lib/dates"
import { pluralize } from "@/lib/format"
import { stripHtml, thoughtTitle } from "@/lib/thoughts"
import { cn } from "@/lib/utils"
import type { ThoughtCardProps } from "@/types/thought"

export function ThoughtCard({ thought, onEdit }: ThoughtCardProps) {
  const update = useUpdateThought()
  const remove = useRemoveThought()

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border bg-muted/30 p-1 shadow-xs">
      <div className="flex min-h-28 flex-col gap-1.5 px-3 pt-2.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => onEdit(thought)} className="flex min-w-0 cursor-pointer items-center gap-2 text-left">
            <span className={cn("h-1.5 w-2.5 shrink-0 rounded-full", thought.pinned ? "bg-primary" : "bg-info")} aria-hidden="true" />
            <h3 className="truncate text-sm font-medium hover:underline">{thoughtTitle(thought)}</h3>
          </button>
          <RowActions
            label={`${thoughtTitle(thought)} actions`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => onEdit(thought) },
              {
                label: thought.pinned ? "Unpin" : "Pin",
                icon: thought.pinned ? PinOff : Pin,
                onSelect: () => update.mutate({ id: thought.id, input: { pinned: !thought.pinned } }),
              },
              { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove.mutate(thought.id) },
            ]}
          />
        </div>
        <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{stripHtml(thought.body) || "No details yet."}</p>
      </div>
      <dl className="flex flex-col gap-2.5 rounded-xl border bg-card px-3 py-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <StatusBadge label={thought.pinned ? "Pinned" : "Note"} tone={thought.pinned ? "brand" : "info"} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Linked</dt>
          <dd className="rounded-md border px-2 py-0.5 text-xs">{pluralize(thought.linkedTaskIds.length, "task")}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Created</dt>
          <dd className="rounded-md border px-2 py-0.5 text-xs">{formatRelativeDay(thought.createdAt)}</dd>
        </div>
        {thought.tags.length > 0 ? <TagList tags={thought.tags} /> : null}
      </dl>
    </article>
  )
}
