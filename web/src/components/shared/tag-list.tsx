import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { TagListProps } from "@/types/ui"

export function TagList({ tags, className }: TagListProps) {
  const { t } = useTranslation()
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label={t("navigation.tags")}>
      {tags.map((tag) => (
        <li key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          #{tag}
        </li>
      ))}
    </ul>
  )
}
