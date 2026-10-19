import { useTranslation } from "react-i18next"
import { useState } from "react"
import { ProjectCard } from "@/components/projects/project-card"
import { ProjectColumn } from "@/components/projects/project-column"
import { ProjectQuickAdd } from "@/components/projects/project-quick-add"
import { ProjectWipLimit } from "@/components/projects/project-wip-limit"
import { BoardColumns } from "@/components/shared/board-columns"
import { Button } from "@/components/ui/button"
import {
  DONE_PREVIEW_LIMIT,
  groupProjects,
  isOverWipLimit,
  readWipLimit,
  storeWipLimit,
  toBoardColumns,
  toProjectMove,
} from "@/lib/projects"
import type { ProjectBoardProps, ProjectColumnProps, ProjectStatus } from "@/types/project"

export function ProjectBoard({ projects, actions }: ProjectBoardProps) {
  const { t } = useTranslation()
  const [showAllDone, setShowAllDone] = useState(false)
  const [wipLimit, setWipLimit] = useState(readWipLimit)
  const columns = groupProjects(projects)

  const changeWipLimit = (limit: number | null) => {
    storeWipLimit(limit)
    setWipLimit(limit)
  }

  // The extra controls each column carries around its cards.
  const extras: Partial<Record<ProjectStatus, Partial<ProjectColumnProps>>> = {
    idea: { top: <ProjectQuickAdd /> },
    in_progress: {
      action: <ProjectWipLimit limit={wipLimit} onChange={changeWipLimit} />,
      warning: isOverWipLimit(columns.in_progress.length, wipLimit) ? t("projects.overWipLimit", { limit: wipLimit }) : undefined,
    },
    done: {
      bottom:
        columns.done.length > DONE_PREVIEW_LIMIT ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowAllDone((current) => !current)}>
            {showAllDone ? t("projects.showLess") : t("projects.showAll", { count: columns.done.length })}
          </Button>
        ) : null,
    },
  }

  return (
    <BoardColumns
      columns={toBoardColumns(columns, showAllDone)}
      getItemId={(project) => project.id}
      renderItem={(project) => <ProjectCard project={project} actions={actions} />}
      renderColumn={(id, list) => (
        <ProjectColumn status={id as ProjectStatus} count={columns[id as ProjectStatus].length} {...extras[id as ProjectStatus]}>
          {list}
        </ProjectColumn>
      )}
      onMove={(move) => actions.move(toProjectMove(projects, move))}
    />
  )
}
