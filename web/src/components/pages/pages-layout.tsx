import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PanelLeft } from "lucide-react"
import { PageTree } from "@/components/pages/page-tree"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import type { PagesLayoutProps } from "@/types/page"

/** The tree on the left and the page on the right; below `md` the tree opens in a sheet. */
export function PagesLayout({ children }: PagesLayoutProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <h1 className="sr-only">{t("navigation.pages")}</h1>
      {isMobile ? (
        <>
          <div className="flex items-center border-b px-4 py-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
              <PanelLeft />
              {t("pages.showTree")}
            </Button>
          </div>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="left" showCloseButton={false} className="w-80 max-w-[85vw] gap-0 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>{t("navigation.pages")}</SheetTitle>
                <SheetDescription>{t("pages.treeDescription")}</SheetDescription>
              </SheetHeader>
              <PageTree onOpenPage={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <aside className="flex w-72 shrink-0 flex-col border-r lg:w-80" aria-label={t("pages.treeDescription")}>
          <PageTree />
        </aside>
      )}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</section>
    </div>
  )
}
