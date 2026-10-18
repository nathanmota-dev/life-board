import { useTranslation } from "react-i18next"
import { FormField } from "@/components/shared/form-field"
import { SelectField } from "@/components/shared/select-field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getTaskPriorityOptions, getTaskStatusOptions } from "@/lib/tasks"
import type { TaskFormFieldsProps, TaskFormValues } from "@/types/task"

export function TaskFormFields({ values, onChange }: TaskFormFieldsProps) {
  const { t } = useTranslation()
  const set = <K extends keyof TaskFormValues>(field: K, value: TaskFormValues[K]) => onChange({ ...values, [field]: value })

  return (
    <>
      <FormField label={t("common.title")} htmlFor="task-title">
        <Input id="task-title" autoFocus value={values.title} onChange={(event) => set("title", event.target.value)} placeholder={t("tasks.titlePlaceholder")} />
      </FormField>
      <FormField label={t("common.notes")} htmlFor="task-description">
        <Textarea id="task-description" rows={3} value={values.description} onChange={(event) => set("description", event.target.value)} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t("common.status")} htmlFor="task-status">
          <SelectField id="task-status" value={values.status} options={getTaskStatusOptions()} onChange={(value) => set("status", value)} />
        </FormField>
        <FormField label={t("tasks.priority")} htmlFor="task-priority">
          <SelectField id="task-priority" value={values.priority} options={getTaskPriorityOptions()} onChange={(value) => set("priority", value)} />
        </FormField>
        <FormField label={t("tasks.dueDate")} htmlFor="task-due">
          <Input id="task-due" type="date" value={values.dueAt} onChange={(event) => set("dueAt", event.target.value)} />
        </FormField>
      </div>
      <FormField label={t("navigation.tags")} htmlFor="task-tags" hint={t("common.commaSeparated")}>
        <Input id="task-tags" value={values.tags} onChange={(event) => set("tags", event.target.value)} placeholder={t("tasks.tagsPlaceholder")} />
      </FormField>
    </>
  )
}
