import { useTranslation } from "react-i18next"
import { Palette } from "lucide-react"
import { TaskColorPicker } from "@/components/tasks/task-color-picker"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getTaskChipOptions, getTaskColorOptions, TASK_COLOR_CLASSES } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import type { TaskFiltersProps } from "@/types/task"

const ALL_TAGS = "__all__"

/** Filter chips (Today, Upcoming, Someday, Overdue, Archived) plus tag and color filters. */
export function TaskFilters({ filters, tags, onChange }: TaskFiltersProps) {
  const { t } = useTranslation()
  const colorLabel = filters.color ? getTaskColorOptions().find((option) => option.value === filters.color)?.label : t("tasks.anyColor")

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <div role="group" aria-label={t("tasks.filters")} className="flex flex-wrap gap-1.5">
        {getTaskChipOptions().map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filters.chip === option.value}
            onClick={() => onChange({ ...filters, chip: option.value })}
            className={cn(
              "h-7 cursor-pointer rounded-full border px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
              filters.chip === option.value && "border-primary bg-primary/10 font-medium text-primary hover:text-primary",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {tags.length > 0 ? (
        <Select value={filters.tag ?? ALL_TAGS} onValueChange={(tag) => onChange({ ...filters, tag: tag === ALL_TAGS ? null : tag })}>
          <SelectTrigger size="sm" aria-label={t("tasks.tagFilter")} className={cn("h-7 rounded-full", filters.tag && "border-primary text-primary")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TAGS}>{t("tasks.allTags")}</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                #{tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="xs" aria-label={t("tasks.colorFilter")} className={cn("h-7 rounded-full px-3 font-normal", filters.color && "border-primary text-primary")}>
            {filters.color ? <span className={cn("size-3 rounded-full border", TASK_COLOR_CLASSES[filters.color].swatch)} aria-hidden="true" /> : <Palette />}
            {colorLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <TaskColorPicker value={filters.color} clearLabel={t("tasks.anyColor")} onChange={(color) => onChange({ ...filters, color })} />
        </PopoverContent>
      </Popover>
    </div>
  )
}
