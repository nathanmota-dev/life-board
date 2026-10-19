import { useTranslation } from "react-i18next"
import { useDeferredValue, useState } from "react"
import { ListTodo, Plus } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SearchInput } from "@/components/shared/search-input"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { TaskBoard } from "@/components/tasks/task-board"
import { TaskComposer } from "@/components/tasks/task-composer"
import { TaskFilters } from "@/components/tasks/task-filters"
import { TaskFormDialog } from "@/components/tasks/task-form-dialog"
import { TaskTable } from "@/components/tasks/task-table"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useBoardTasks } from "@/hooks/queries/use-tasks"
import {
  collectTags,
  DEFAULT_BOARD_FILTERS,
  filterBoardTasks,
  groupBoardTasks,
  hasActiveFilters,
  readTaskLayout,
  saveTaskLayout,
  sortForList,
} from "@/lib/tasks"
import type { Task, TaskBoardFilters, TaskDialogState, TaskLayout } from "@/types/task"

export function TasksPage() {
  const { t } = useTranslation()
  const [layout, setLayout] = useState<TaskLayout>(readTaskLayout)
  const [filters, setFilters] = useState<TaskBoardFilters>(DEFAULT_BOARD_FILTERS)
  const [search, setSearch] = useState("")
  const [dialog, setDialog] = useState<TaskDialogState>({ open: false, task: null })
  const archived = filters.chip === "archived"
  // New tasks are open and unarchived, so the composer would drop them out of these views.
  const showComposer = layout === "board" && !archived && filters.chip !== "completed"
  const tasks = useBoardTasks({ search: useDeferredValue(search.trim()), archived: archived || undefined, limit: 500 })
  const items = tasks.data ?? []
  const visible = filterBoardTasks(items, filters)
  const filtered = hasActiveFilters(filters, search)
  const openDialog = (task: Task | null) => setDialog({ open: true, task })
  const changeLayout = (next: TaskLayout) => {
    setLayout(next)
    saveTaskLayout(next)
  }

  return (
    <Page
      title={t("navigation.tasks")}
      description={t("tasks.description")}
      actions={
        <>
          <SegmentedControl
            label={t("tasks.layout")}
            value={layout}
            onChange={changeLayout}
            options={[
              { value: "board", label: t("tasks.board") },
              { value: "list", label: t("tasks.list") },
            ]}
          />
          <Button size="sm" onClick={() => openDialog(null)}>
            <Plus />
            {t("tasks.newTask")}
          </Button>
        </>
      }
      toolbar={
        <>
          <TaskFilters filters={filters} tags={collectTags(items)} onChange={setFilters} />
          <SearchInput value={search} onChange={setSearch} placeholder={t("tasks.search")} />
        </>
      }
    >
      <PageSection>
        <div className="flex min-w-0 flex-col gap-6">
          {showComposer ? <TaskComposer /> : null}
          <DataState
            isLoading={tasks.isLoading}
            error={tasks.error}
            isEmpty={visible.length === 0}
            empty={
              <EmptyState
                icon={ListTodo}
                title={filtered ? t("tasks.noFilterResults") : t("tasks.empty")}
                description={filtered ? t("tasks.noFilterResultsDescription") : t("tasks.emptyDescription")}
              />
            }
          >
            {layout === "board" ? (
              <TaskBoard sections={groupBoardTasks(visible)} sortable={!filtered} onEdit={openDialog} />
            ) : (
              <TaskTable tasks={sortForList(visible)} onEdit={openDialog} />
            )}
          </DataState>
        </div>
      </PageSection>
      <TaskFormDialog
        key={`${dialog.task?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        task={dialog.task}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Page>
  )
}
