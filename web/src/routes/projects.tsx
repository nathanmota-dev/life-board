import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Plus, Rocket } from "lucide-react"
import { ProjectArchivedList } from "@/components/projects/project-archived-list"
import { ProjectBoard } from "@/components/projects/project-board"
import { ProjectDetailSheet } from "@/components/projects/project-detail-sheet"
import { ProjectFormDialog } from "@/components/projects/project-form-dialog"
import { ProjectPauseDialog } from "@/components/projects/project-pause-dialog"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useProjects } from "@/hooks/queries/use-projects"
import { useProjectActions } from "@/hooks/use-project-actions"
import type { Project, ProjectDialogState, ProjectMove, ProjectView } from "@/types/project"

export function ProjectsPage() {
  const { t } = useTranslation()
  const [view, setView] = useState<ProjectView>("board")
  const [dialog, setDialog] = useState<ProjectDialogState>({ open: false, project: null })
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [pendingPause, setPendingPause] = useState<ProjectMove | null>(null)
  const projects = useProjects()
  const items = projects.data ?? []
  const openDialog = (project: Project | null) => setDialog({ open: true, project })
  const actions = useProjectActions(items, {
    open: (project) => setOpenProjectId(project.id),
    edit: openDialog,
    askPauseReason: setPendingPause,
  })

  return (
    <Page
      title={t("navigation.projects")}
      description={t("projects.description")}
      actions={
        <Button size="sm" onClick={() => openDialog(null)}>
          <Plus />
          {t("projects.newProject")}
        </Button>
      }
      toolbar={
        <SegmentedControl
          label={t("projects.views")}
          value={view}
          options={[
            { value: "board", label: t("projects.board"), count: items.length },
            { value: "archived", label: t("projects.archived") },
          ]}
          onChange={setView}
        />
      }
    >
      <PageSection className="flex min-h-0 flex-1 flex-col">
        {view === "archived" ? (
          <ProjectArchivedList />
        ) : (
          <DataState
            isLoading={projects.isLoading}
            error={projects.error}
            isEmpty={items.length === 0}
            empty={
              <EmptyState
                icon={Rocket}
                title={t("projects.empty")}
                description={t("projects.emptyDescription")}
                action={
                  <Button size="sm" variant="outline" onClick={() => openDialog(null)}>
                    <Plus />
                    {t("projects.newProject")}
                  </Button>
                }
              />
            }
          >
            <ProjectBoard projects={items} actions={actions} />
          </DataState>
        )}
      </PageSection>
      <ProjectDetailSheet
        project={items.find((project) => project.id === openProjectId) ?? null}
        actions={actions}
        onClose={() => setOpenProjectId(null)}
      />
      <ProjectFormDialog
        key={`${dialog.project?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        project={dialog.project}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
      <ProjectPauseDialog
        key={pendingPause?.id ?? "none"}
        move={pendingPause}
        onConfirm={(move) => {
          setPendingPause(null)
          actions.move(move)
        }}
        onCancel={() => setPendingPause(null)}
      />
    </Page>
  )
}
