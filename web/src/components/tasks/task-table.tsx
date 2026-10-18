import { useTranslation } from "react-i18next"
import { TaskRow } from "@/components/tasks/task-row"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { TaskTableProps } from "@/types/task"

export function TaskTable({ tasks, onEdit }: TaskTableProps) {
  const { t } = useTranslation()
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 pl-4">
              <span className="sr-only">{t("common.done")}</span>
            </TableHead>
            <TableHead>{t("inbox.task")}</TableHead>
            <TableHead>{t("tasks.priority")}</TableHead>
            <TableHead>{t("tasks.due")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">{t("common.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onEdit={onEdit} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
