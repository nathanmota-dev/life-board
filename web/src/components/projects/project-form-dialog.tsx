import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { SelectField } from "@/components/shared/select-field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCreateProject, useUpdateProject } from "@/hooks/queries/use-projects"
import { emptyProjectValues, PROJECT_STATUS_OPTIONS, projectToValues, valuesToProjectInput } from "@/lib/projects"
import type { ProjectFormDialogProps, ProjectFormValues } from "@/types/project"

export function ProjectFormDialog({ open, project, onOpenChange }: ProjectFormDialogProps) {
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
      title={project ? "Edit project" : "New project"}
      submitLabel={project ? "Save" : "Add project"}
      isPending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
    >
      <FormField label="Title" htmlFor="project-title">
        <Input id="project-title" autoFocus value={values.title} onChange={(event) => set("title", event.target.value)} placeholder="Budget tracker app" />
      </FormField>
      <FormField label="Description" htmlFor="project-description">
        <Textarea
          id="project-description"
          rows={5}
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder="What is it, and where did you leave off?"
        />
      </FormField>
      <FormField label="Status" htmlFor="project-status">
        <SelectField id="project-status" value={values.status} options={PROJECT_STATUS_OPTIONS} onChange={(status) => set("status", status)} />
      </FormField>
    </DialogForm>
  )
}
