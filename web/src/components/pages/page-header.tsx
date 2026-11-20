import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Download, Pencil } from "lucide-react"
import { SaveTextButton } from "@/components/file-board/save-text-button"
import { PageTitleInput } from "@/components/pages/page-title-input"
import { Button } from "@/components/ui/button"
import type { PageHeaderProps } from "@/types/page"

/** The breadcrumb, the title (renamed in place) and the actions of the open page. */
export function PageHeader({ page, ancestors, editing, dirty, onToggleEditing, onSave, onRename, onDownload }: PageHeaderProps) {
  const { t } = useTranslation()
  const [renaming, setRenaming] = useState(false)

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
      <div className="min-w-0 flex-1">
        <nav aria-label={t("pages.breadcrumb")}>
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {[...ancestors, page].map((item, index) => (
              <li key={item.id} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <span aria-current={item.id === page.id ? "page" : undefined}>{item.title}</span>
              </li>
            ))}
          </ol>
        </nav>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">
          {renaming ? (
            <PageTitleInput
              initial={page.title}
              label={t("pages.renameLabel", { title: page.title })}
              onSubmit={(title) => {
                setRenaming(false)
                onRename(title)
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <button
              type="button"
              className="max-w-full cursor-text truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              title={t("pages.renameHint")}
              onDoubleClick={() => setRenaming(true)}
              onKeyDown={(event) => {
                if (event.key === "F2") setRenaming(true)
              }}
            >
              {page.title}
            </button>
          )}
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {dirty ? <SaveTextButton onSave={onSave} /> : null}
        <Button type="button" size="sm" variant="outline" onClick={onDownload}>
          <Download />
          {t("pages.download")}
        </Button>
        <Button type="button" size="sm" onClick={onToggleEditing}>
          {editing ? <Check /> : <Pencil />}
          {editing ? t("pages.done") : t("pages.edit")}
        </Button>
      </div>
    </header>
  )
}
