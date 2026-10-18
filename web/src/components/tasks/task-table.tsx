import { TaskRow } from "@/components/tasks/task-row"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { TaskTableProps } from "@/types/task"

export function TaskTable({ tasks, onEdit }: TaskTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 pl-4">
              <span className="sr-only">Done</span>
            </TableHead>
            <TableHead>Task</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
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
