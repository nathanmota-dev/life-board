import { Link, useMatches } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

export function RouteBreadcrumb() {
  const { t } = useTranslation()
  const breadcrumbs = useMatches({
    select: (matches) =>
      matches.flatMap((match) =>
        match.staticData.titleKey
          ? [{ id: match.id, titleKey: match.staticData.titleKey, to: match.pathname }]
          : [],
      ),
  })

  return (
    <nav aria-label={t("navigation.breadcrumb")} className="min-w-0 overflow-x-auto">
      <ol className="flex items-center gap-2 whitespace-nowrap text-sm">
        {breadcrumbs.map((breadcrumb, index) => {
          const isCurrentPage = index === breadcrumbs.length - 1

          return (
            <li key={breadcrumb.id} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="text-muted-foreground">
                  /
                </span>
              )}
              {isCurrentPage ? (
                <span aria-current="page" className="font-medium">
                  {t(breadcrumb.titleKey)}
                </span>
              ) : (
                <Link
                  to={breadcrumb.to}
                  activeOptions={{ exact: true }}
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t(breadcrumb.titleKey)}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
