import { isSaveShortcut } from "@/lib/keyboard"
import { cn } from "@/lib/utils"
import type { PlainTextAreaProps } from "@/types/page"

/** The raw text of a file in a plain editor; Ctrl+S saves it. */
export function PlainTextArea({ value, label, onChange, onSaveShortcut, className }: PlainTextAreaProps) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (isSaveShortcut(event)) {
          event.preventDefault()
          onSaveShortcut()
        }
      }}
      aria-label={label}
      spellCheck={false}
      className={cn(
        "block h-[calc(100dvh-14rem)] min-h-40 w-full resize-none rounded-2xl border bg-card p-5 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    />
  )
}
