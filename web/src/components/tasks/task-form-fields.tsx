import { FormField } from "@/components/shared/form-field"
import { SelectField } from "@/components/shared/select-field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from "@/lib/tasks"
import type { TaskFormFieldsProps, TaskFormValues } from "@/types/task"

export function TaskFormFields({ values, onChange }: TaskFormFieldsProps) {
  const set = <K extends keyof TaskFormValues>(field: K, value: TaskFormValues[K]) => onChange({ ...values, [field]: value })

  return (
    <>
      <FormField label="Title" htmlFor="task-title">
        <Input id="task-title" autoFocus value={values.title} onChange={(event) => set("title", event.target.value)} placeholder="What needs to be done?" />
      </FormField>
      <FormField label="Notes" htmlFor="task-description">
        <Textarea id="task-description" rows={3} value={values.description} onChange={(event) => set("description", event.target.value)} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Status" htmlFor="task-status">
          <SelectField id="task-status" value={values.status} options={STATUS_OPTIONS} onChange={(value) => set("status", value)} />
        </FormField>
        <FormField label="Priority" htmlFor="task-priority">
          <SelectField id="task-priority" value={values.priority} options={PRIORITY_OPTIONS} onChange={(value) => set("priority", value)} />
        </FormField>
        <FormField label="Due date" htmlFor="task-due">
          <Input id="task-due" type="date" value={values.dueAt} onChange={(event) => set("dueAt", event.target.value)} />
        </FormField>
      </div>
      <FormField label="Tags" htmlFor="task-tags" hint="Separate with commas.">
        <Input id="task-tags" value={values.tags} onChange={(event) => set("tags", event.target.value)} placeholder="home, errands" />
      </FormField>
    </>
  )
}
