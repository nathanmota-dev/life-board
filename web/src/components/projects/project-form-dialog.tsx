import { useTranslation } from "react-i18next"
import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { SelectField } from "@/components/shared/select-field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCreateProject, useUpdateProject } from "@/hooks/queries/use-projects"
import { emptyProjectValues, getProjectStatusOptions, projectToValues, valuesToProjectInput } from "@/lib/projects"
import type { ProjectFormDialogProps, ProjectFormValues } from "@/types/project"

export function ProjectFormDialog({ open, project, onOpenChange }: ProjectFormDialogProps) {
  const { t } = useTranslation()
  const [values, setValues] = useState(() => (project ? projectToValues(project) : emptyProjectValues()))
  const create = useCreateProject()
  const update = useUpdateProject()
  const mutation = project ? update : create
  const set = <K extends keyof ProjectFormValues>(field: K, value: ProjectFormValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }))

  const submit = () => {
    const input = valuesToProjectInput(values)
    const done = { onSuccess: () => onOpenChange(false) }
    if (input.title) {
      if (project) update.mutate({ id: project.id, input }, done)
      else create.mutate(input, done)
    }
  }

  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={project ? t("projects.editProject") : t("projects.newProject")}
      submitLabel={project ? t("common.save") : t("projects.addProject")}
      isPending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
    >
      <FormField label={t("common.title")} htmlFor="project-title">
        <Input id="project-title" autoFocus value={values.title} onChange={(event) => set("title", event.target.value)} placeholder={t("projects.titlePlaceholder")} />
      </FormField>
      <FormField label={t("common.description")} htmlFor="project-description">
        <Textarea
          id="project-description"
          rows={5}
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder={t("projects.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("common.status")} htmlFor="project-status">
        <SelectField id="project-status" value={values.status} options={getProjectStatusOptions()} onChange={(status) => set("status", status)} />
      </FormField>
      {values.status === "paused" ? (
        <FormField label={t("projects.pauseReason")} htmlFor="project-pause-reason" hint={t("common.optional")}>
          <Input
            id="project-pause-reason"
            maxLength={200}
            value={values.pauseReason}
            onChange={(event) => set("pauseReason", event.target.value)}
            placeholder={t("projects.pauseReasonPlaceholder")}
          />
        </FormField>
      ) : null}
    </DialogForm>
  )
}
