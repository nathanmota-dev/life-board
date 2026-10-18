import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { TaskBacklinks } from "@/components/tasks/task-backlinks"
import { TaskFormFields } from "@/components/tasks/task-form-fields"
import { useCreateTask, useUpdateTask } from "@/hooks/queries/use-tasks"
import { emptyTaskValues, taskToValues, valuesToInput } from "@/lib/tasks"
import type { TaskFormDialogProps } from "@/types/task"

export function TaskFormDialog({ open, task, defaultStatus, onOpenChange }: TaskFormDialogProps) {
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
      title={task ? "Edit task" : "New task"}
      submitLabel={task ? "Save" : "Create task"}
      isPending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
    >
      <TaskFormFields values={values} onChange={setValues} />
      {task ? <TaskBacklinks taskId={task.id} /> : null}
    </DialogForm>
  )
}
