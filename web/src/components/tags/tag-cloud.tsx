import { Hash } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TagCloudProps } from "@/types/tag"

export function TagCloud({ tags, selected, onSelect }: TagCloudProps) {
  return (
    <ul className="flex flex-col gap-0.5">
      {tags.map((tag) => (
        <li key={tag.name}>
          <button
            type="button"
            aria-current={tag.name === selected ? "true" : undefined}
            onClick={() => onSelect(tag.name)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60",
              tag.name === selected && "bg-primary/10 font-medium text-primary",
            )}
          >
            <Hash className="size-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{tag.total}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
