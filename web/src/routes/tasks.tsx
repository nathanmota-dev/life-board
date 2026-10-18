import { useTranslation } from "react-i18next"
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
import { countByStatus, getTaskStatusOptions } from "@/lib/tasks"
import type { Task, TaskDialogState, TaskView } from "@/types/task"

export function TasksPage() {
  const { t } = useTranslation()
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
      title={t("navigation.tasks")}
      description={t("tasks.description")}
      actions={
        <Button size="sm" onClick={() => openDialog(null)}>
          <Plus />
          {t("tasks.newTask")}
        </Button>
      }
      toolbar={
        <>
          <SegmentedControl
            label={t("tasks.views")}
            value={view}
            onChange={setView}
            options={[{ value: "all", label: t("common.all"), count: items.length }, ...getTaskStatusOptions().map((option) => ({ ...option, count: counts[option.value] }))]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder={t("tasks.search")} />
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
              title={search ? t("tasks.noSearchResults") : t("tasks.empty")}
              description={t("tasks.emptyDescription")}
              action={<Button size="sm" variant="outline" onClick={() => openDialog(null)}>{t("tasks.newTask")}</Button>}
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
