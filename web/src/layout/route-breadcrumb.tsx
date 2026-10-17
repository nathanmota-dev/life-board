import { Link, useMatches } from "@tanstack/react-router"

export function RouteBreadcrumb() {
  const breadcrumbs = useMatches({
    select: (matches) =>
      matches.flatMap((match) =>
        match.staticData.title
          ? [{ id: match.id, title: match.staticData.title, to: match.pathname }]
          : [],
      ),
  })

  return (
    <nav aria-label="Caminho da página" className="min-w-0 overflow-x-auto">
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
                  {breadcrumb.title}
                </span>
              ) : (
                <Link
                  to={breadcrumb.to}
                  activeOptions={{ exact: true }}
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                >
                  {breadcrumb.title}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
