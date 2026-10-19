import { useTranslation } from "react-i18next"
import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { TaskBacklinks } from "@/components/tasks/task-backlinks"
import { TaskChecklistEditor } from "@/components/tasks/task-checklist-editor"
import { TaskFormFields } from "@/components/tasks/task-form-fields"
import { useCreateTask, useUpdateTask } from "@/hooks/queries/use-tasks"
import { emptyTaskValues, taskToValues, valuesToInput } from "@/lib/tasks"
import type { TaskFormDialogProps } from "@/types/task"

export function TaskFormDialog({ open, task, defaultStatus, onOpenChange }: TaskFormDialogProps) {
  const { t } = useTranslation()
  const [values, setValues] = useState(() => (task ? taskToValues(task) : emptyTaskValues(defaultStatus)))
  const create = useCreateTask()
  const update = useUpdateTask()
  const mutation = task ? update : create

  const submit = () => {
    const input = valuesToInput(values)
    const done = { onSuccess: () => onOpenChange(false) }
    if (input.title) {
      if (task) update.mutate({ id: task.id, input }, done)
      else create.mutate(input, done)
    }
  }

  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={task ? t("tasks.editTask") : t("tasks.newTask")}
      submitLabel={task ? t("common.save") : t("tasks.createTask")}
      isPending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
    >
      <TaskFormFields values={values} onChange={setValues} />
      {task ? <TaskChecklistEditor taskId={task.id} /> : null}
      {task ? <TaskBacklinks taskId={task.id} /> : null}
    </DialogForm>
  )
}
