import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Hash, Tags } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SearchInput } from "@/components/shared/search-input"
import { TagCloud } from "@/components/tags/tag-cloud"
import { TagDetail } from "@/components/tags/tag-detail"
import { Page, PageSection, Panel } from "@/components/workspace-ui"
import { useTasks } from "@/hooks/queries/use-tasks"
import { useThoughts } from "@/hooks/queries/use-thoughts"
import { summarizeTags } from "@/lib/tags"

export function TagsPage() {
  const { t } = useTranslation()
  const tasks = useTasks({ limit: 100 })
  const thoughts = useThoughts({ limit: 100 })
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const tags = summarizeTags(tasks.data ?? [], thoughts.data ?? [])
  const visible = tags.filter((tag) => tag.name.includes(search.trim().toLowerCase()))
  const active = selected ?? tags[0]?.name ?? null

  return (
    <Page
      title={t("navigation.tags")}
      description={t("tags.description")}
      toolbar={
        <>
          <p className="text-sm text-muted-foreground">{t("counts.tag", { count: tags.length })}</p>
          <SearchInput value={search} onChange={setSearch} placeholder={t("tags.filter")} />
        </>
      }
    >
      <PageSection>
        <DataState
          isLoading={tasks.isLoading || thoughts.isLoading}
          error={tasks.error ?? thoughts.error}
          isEmpty={tags.length === 0}
          empty={<EmptyState icon={Tags} title={t("tags.empty")} description={t("tags.emptyDescription")} />}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,3fr)]">
            <Panel title={t("tags.all")} icon={Hash} contentClassName="pb-3">
              <TagCloud tags={visible} selected={active} onSelect={setSelected} />
            </Panel>
            {active ? <TagDetail key={active} tag={active} /> : null}
          </div>
        </DataState>
      </PageSection>
    </Page>
  )
}
