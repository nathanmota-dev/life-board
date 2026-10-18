import { cn } from "@/lib/utils"
import type { SegmentedControlProps } from "@/types/ui"

/** The pill switcher used for view filters (All / Today / Done…). */
export function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            option.value === value && "bg-background font-medium text-foreground shadow-xs",
          )}
        >
          {option.label}
          {option.count !== undefined ? <span className="text-xs text-muted-foreground tabular-nums">{option.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
