import { cn } from "@/lib/utils"
import type { MacWindowProps } from "@/types/pomodoro"

/** A card dressed as a macOS window: traffic lights and a centred title. */
export function MacWindow({ title, className, bodyClassName, children }: MacWindowProps) {
  return (
    <section
      aria-label={title}
      className={cn("flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/85 shadow-lg shadow-black/5 backdrop-blur-xl dark:shadow-black/30", className)}
    >
      <header className="relative flex h-9 shrink-0 items-center border-b px-3.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <h2 className="pointer-events-none absolute inset-x-0 text-center text-xs font-medium text-muted-foreground">{title}</h2>
      </header>
      <div className={cn("flex min-w-0 flex-1 flex-col p-5", bodyClassName)}>{children}</div>
    </section>
  )
}
