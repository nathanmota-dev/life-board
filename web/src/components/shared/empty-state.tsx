import { cn } from "@/lib/utils"
import type { EmptyStateProps } from "@/types/ui"

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center", className)}>
      <Icon className="size-6 text-muted-foreground" strokeWidth={1.7} />
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
