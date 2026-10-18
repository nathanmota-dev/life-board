import { useState } from "react"
import { Plus, Rocket } from "lucide-react"
import { ProjectFormDialog } from "@/components/projects/project-form-dialog"
import { ProjectGrid } from "@/components/projects/project-grid"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useProjects } from "@/hooks/queries/use-projects"
import type { Project, ProjectDialogState } from "@/types/project"

export function ProjectsPage() {
  const [dialog, setDialog] = useState<ProjectDialogState>({ open: false, project: null })
  const projects = useProjects()
  const items = projects.data ?? []
  const openDialog = (project: Project | null) => setDialog({ open: true, project })

  return (
    <Page
      title="Projects"
      description="Project ideas and things you started. Drag the cards to set their order."
      actions={
        <Button size="sm" onClick={() => openDialog(null)}>
          <Plus />
          New project
        </Button>
      }
    >
      <PageSection>
        <DataState
          isLoading={projects.isLoading}
          error={projects.error}
          isEmpty={items.length === 0}
          empty={<EmptyState icon={Rocket} title="No projects yet" description="Add a project idea to see it here." />}
        >
          <ProjectGrid projects={items} onEdit={openDialog} />
        </DataState>
      </PageSection>
      <ProjectFormDialog
        key={`${dialog.project?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        project={dialog.project}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Page>
  )
}
