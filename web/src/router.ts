import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouteComponent,
} from "@tanstack/react-router"
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
    staticData: { titleKey: "navigation.settings" },
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
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
