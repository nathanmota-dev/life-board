import { useTranslation } from "react-i18next"
import { ChevronDown, ListTodo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTasks } from "@/hooks/queries/use-tasks"
import type { TaskPickerProps } from "@/types/thought"

/** Multi-select of tasks a thought (or goal) relates to. */
export function TaskPicker({ selected, onChange }: TaskPickerProps) {
  const { t } = useTranslation()
  const tasks = useTasks({ limit: 100 })
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className="flex items-center gap-2">
            <ListTodo className="text-muted-foreground" />
            {selected.length > 0 ? t("counts.linkedTask", { count: selected.length }) : t("thoughts.linkTasks")}
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto p-1">
        <ul>
          {(tasks.data ?? []).map((task) => (
            <li key={task.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <Checkbox checked={selected.includes(task.id)} onCheckedChange={() => toggle(task.id)} />
                <span className="truncate">{task.title}</span>
              </label>
            </li>
          ))}
        </ul>
        {tasks.data?.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">{t("thoughts.noTasks")}</p> : null}
      </PopoverContent>
    </Popover>
  )
}
