import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PageProps, PageSectionProps, PanelProps, StatusProps } from "@/types/ui"

export function Page({ title, description, actions, toolbar, children }: PageProps) {
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </header>
      {toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">{toolbar}</div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

/** A full-width band of the page, separated from the next one by a rule. */
export function PageSection({ title, action, className, children }: PageSectionProps) {
  return (
    <div className={cn("min-w-0 border-b px-6 py-5 last:border-b-0", className)}>
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-medium">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  )
}

export function Panel({ title, icon: Icon, action, className, contentClassName, children }: PanelProps) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-2xl border bg-card shadow-xs", className)}>
      <div className="flex min-h-14 items-center justify-between gap-3 px-5 py-3">
        <h2 className="flex items-center gap-2 text-base font-medium">
          {Icon ? <Icon className="size-4 text-muted-foreground" strokeWidth={1.7} /> : null}
          {title}
        </h2>
        {action}
      </div>
      <div className={cn("min-w-0 flex-1 px-5 pb-5", contentClassName)}>{children}</div>
    </div>
  )
}

export function Status({ value }: StatusProps) {
  return (
    <Badge variant="outline" className="max-w-full rounded-md bg-muted/30 font-normal">
      {value}
    </Badge>
  )
}
