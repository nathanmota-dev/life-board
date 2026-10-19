import { cn, stopCardEvents } from "@/lib/utils"
import type { NoteCardProps } from "@/types/ui"

/**
 * A Keep-style card: header, free content and a row of actions shown on hover or focus.
 * The actions (and their popovers) never reach the card's own pointer and click handlers.
 */
export function NoteCard({ ref, style, className, toneClassName, dragging, label, header, actions, children, onPointerDown, onClick }: NoteCardProps) {
  return (
    <article
      ref={ref}
      style={style}
      aria-label={label}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={cn(
        "group/note flex min-w-0 flex-col gap-2 rounded-2xl border bg-card px-3 pt-3 pb-1.5 shadow-xs transition-shadow hover:shadow-md",
        className,
        toneClassName,
        dragging && "relative z-10 opacity-80 shadow-lg",
      )}
    >
      {header}
      {children}
      {actions ? (
        <div {...stopCardEvents} className="-mx-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/note:opacity-100 group-hover/note:opacity-100 pointer-coarse:opacity-100">
          {actions}
        </div>
      ) : null}
    </article>
  )
}
