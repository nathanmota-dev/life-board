import { useTranslation } from "react-i18next"
import { useDeferredValue, useState } from "react"
import { Lightbulb, Plus } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SearchInput } from "@/components/shared/search-input"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { ThoughtFormDialog } from "@/components/thoughts/thought-form-dialog"
import { ThoughtGrid } from "@/components/thoughts/thought-grid"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useThoughts } from "@/hooks/queries/use-thoughts"
import type { Thought, ThoughtDialogState, ThoughtView } from "@/types/thought"

export function ThoughtsPage() {
  const { t } = useTranslation()
  const [view, setView] = useState<ThoughtView>("all")
  const [search, setSearch] = useState("")
  const [dialog, setDialog] = useState<ThoughtDialogState>({ open: false, thought: null })
  const thoughts = useThoughts({ search: useDeferredValue(search.trim()), pinned: view === "pinned" ? true : undefined, limit: 24 })
  const items = thoughts.data ?? []
  const openDialog = (thought: Thought | null) => setDialog({ open: true, thought })

  return (
    <Page
      title={t("navigation.thoughts")}
      description={t("thoughts.description")}
      actions={
        <Button size="sm" onClick={() => openDialog(null)}>
          <Plus />
          {t("thoughts.newThought")}
        </Button>
      }
      toolbar={
        <>
          <SegmentedControl
            label={t("thoughts.views")}
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: t("common.all") },
              { value: "pinned", label: t("thoughts.pinned") },
            ]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder={t("thoughts.search")} />
        </>
      }
    >
      <PageSection>
        <DataState
          isLoading={thoughts.isLoading}
          error={thoughts.error}
          isEmpty={items.length === 0}
          empty={<EmptyState icon={Lightbulb} title={t("thoughts.empty")} description={t("thoughts.emptyDescription")} />}
        >
          <ThoughtGrid thoughts={items} onEdit={openDialog} />
          {thoughts.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" disabled={thoughts.isFetchingNextPage} onClick={() => thoughts.fetchNextPage()}>
                {t("common.loadMore")}
              </Button>
            </div>
          ) : null}
        </DataState>
      </PageSection>
      <ThoughtFormDialog
        key={`${dialog.thought?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        thought={dialog.thought}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Page>
  )
}
