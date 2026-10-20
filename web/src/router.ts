import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouteComponent,
} from "@tanstack/react-router"
import { CapturePage } from "@/routes/capture"
import { Dashboard } from "@/routes/dashboard"
import { SettingsPage } from "@/routes/settings"
import { workspacePages } from "@/routes/workspace-pages"
import type { NavigationTitleKey } from "@/types/i18n"

export function createAppRouter(sidebarLayout: RouteComponent) {
  const rootRoute = createRootRoute({ component: Outlet })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: () => {
      throw redirect({ to: "/dashboard", replace: true })
    },
  })

  // The global capture window loads this route, outside the sidebar layout.
  const captureRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "capture",
    component: CapturePage,
  })

  const sidebarRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "sidebar",
    component: sidebarLayout,
    staticData: { titleKey: "navigation.workspace" },
  })

  const dashboardRoute = createRoute({
    getParentRoute: () => sidebarRoute,
    path: "dashboard",
    component: Outlet,
    staticData: { titleKey: "navigation.dashboard" },
  })

  const dashboardIndexRoute = createRoute({
    getParentRoute: () => dashboardRoute,
    path: "/",
    component: Dashboard,
  })

  const settingsRoute = createRoute({
    getParentRoute: () => sidebarRoute,
    path: "settings",
    component: SettingsPage,
    validateSearch: (search: Record<string, unknown>): { tab?: "general" | "github" | "updates" } => ({
      tab: search.tab === "updates" || search.tab === "github" || search.tab === "general" ? search.tab : undefined,
    }),
    staticData: { titleKey: "navigation.settings" },
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    captureRoute,
    sidebarRoute.addChildren([
      dashboardRoute.addChildren([dashboardIndexRoute]),
      settingsRoute,
      ...workspacePages.map((page) =>
        createRoute({
          getParentRoute: () => sidebarRoute,
          path: page.path,
          component: page.component,
          staticData: { titleKey: page.titleKey },
        }),
      ),
    ]),
  ])

  return createRouter({
    routeTree,
    history: createHashHistory(),
  })
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    titleKey?: NavigationTitleKey
  }

  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
