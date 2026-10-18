import { useDeferredValue, useState } from "react"
import { ListTodo, Plus } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SearchInput } from "@/components/shared/search-input"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { TaskFormDialog } from "@/components/tasks/task-form-dialog"
import { TaskTable } from "@/components/tasks/task-table"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useTasks } from "@/hooks/queries/use-tasks"
import { countByStatus, STATUS_OPTIONS } from "@/lib/tasks"
import type { Task, TaskDialogState, TaskView } from "@/types/task"

export function TasksPage() {
  const [view, setView] = useState<TaskView>("all")
  const [search, setSearch] = useState("")
  const [dialog, setDialog] = useState<TaskDialogState>({ open: false, task: null })
  const tasks = useTasks({ search: useDeferredValue(search.trim()), limit: 100 })
  const items = tasks.data ?? []
  const counts = countByStatus(items)
  const visible = view === "all" ? items : items.filter((task) => task.status === view)
  const openDialog = (task: Task | null) => setDialog({ open: true, task })

  return (
    <Page
      title="Tasks"
      description="Everything you need to get done, by when it matters."
      actions={
        <Button size="sm" onClick={() => openDialog(null)}>
          <Plus />
          New task
        </Button>
      }
      toolbar={
        <>
          <SegmentedControl
            label="Task views"
            value={view}
            onChange={setView}
            options={[{ value: "all", label: "All", count: items.length }, ...STATUS_OPTIONS.map((option) => ({ ...option, count: counts[option.value] }))]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder="Search tasks" />
        </>
      }
    >
      <PageSection>
        <DataState
          isLoading={tasks.isLoading}
          error={tasks.error}
          isEmpty={visible.length === 0}
          empty={
            <EmptyState
              icon={ListTodo}
              title={search ? "No tasks match your search" : "Nothing here"}
              description="Create a task or pick another view."
              action={<Button size="sm" variant="outline" onClick={() => openDialog(null)}>New task</Button>}
            />
          }
        >
          <TaskTable tasks={visible} onEdit={openDialog} />
        </DataState>
      </PageSection>
      <TaskFormDialog
        key={`${dialog.task?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        task={dialog.task}
        defaultStatus={view === "all" ? "inbox" : view}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Page>
  )
}
