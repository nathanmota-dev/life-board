import { useTranslation } from "react-i18next"
import { Link, Outlet, useParams, useSearch } from "@tanstack/react-router"
import { FileQuestion } from "lucide-react"
import { PageDocument } from "@/components/pages/page-document"
import { PageEmptyState } from "@/components/pages/page-empty-state"
import { PagesLayout } from "@/components/pages/pages-layout"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { usePageContent, usePages } from "@/hooks/queries/use-pages"
import { cn } from "@/lib/utils"

/** The tree stays mounted here while the page on the right changes. */
export function PagesRoute() {
  return (
    <PagesLayout>
      <Outlet />
    </PagesLayout>
  )
}

/** `/pages`: nothing chosen yet. */
export function PagesIndexRoute() {
  return <PageEmptyState />
}

/** `/pages/$pageId`: a page, or a notice when it no longer exists. */
export function PageRoute() {
  const { t } = useTranslation()
  const { pageId = "" } = useParams({ strict: false })
  const { edit } = useSearch({ strict: false }) as { edit?: boolean }
  const pages = usePages()
  const page = pages.data?.find((item) => item.id === pageId && item.kind === "page")
  const content = usePageContent(page ? page.id : null)
  const missing = !pages.isLoading && !pages.error && !page

  return page && content.data ? (
    <PageDocument key={page.id} page={page} content={content.data.content} initialEditing={edit === true} />
  ) : (
    <div className="flex flex-1 items-center justify-center p-6">
      <DataState
        isLoading={!missing && !pages.error && !content.error}
        error={pages.error ?? content.error}
        isEmpty={missing}
        empty={
          <EmptyState
            icon={FileQuestion}
            title={t("pages.notFound")}
            description={t("pages.notFoundDescription")}
            action={
              <Link to="/pages" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                {t("pages.backToPages")}
              </Link>
            }
          />
        }
      >
        {null}
      </DataState>
    </div>
  )
}
