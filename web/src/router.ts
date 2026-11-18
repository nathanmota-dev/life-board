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
import { FileBoardPage } from "@/routes/file-board"
import { FileItemPage } from "@/routes/file-item"
import { SettingsPage } from "@/routes/settings"
import { workspacePages } from "@/routes/workspace-pages"
import type { NavigationTitleKey } from "@/types/i18n"
import { SETTINGS_TABS, type SettingsTab } from "@/types/settings"

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
    validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } => ({
      tab: SETTINGS_TABS.find((tab) => tab === search.tab),
    }),
    staticData: { titleKey: "navigation.settings" },
  })

  // File Board has a child page per file, so it is built here instead of in the flat workspace list.
  const fileBoardRoute = createRoute({
    getParentRoute: () => sidebarRoute,
    path: "file-board",
    component: Outlet,
    staticData: { titleKey: "navigation.file-board" },
  })

  const fileBoardIndexRoute = createRoute({
    getParentRoute: () => fileBoardRoute,
    path: "/",
    component: FileBoardPage,
    validateSearch: (search: Record<string, unknown>): { board?: string } => ({
      board: typeof search.board === "string" || typeof search.board === "number" ? String(search.board) : undefined,
    }),
  })

  const fileItemRoute = createRoute({
    getParentRoute: () => fileBoardRoute,
    path: "$boardId/$itemId",
    component: FileItemPage,
    staticData: { titleKey: "navigation.file-item" },
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    captureRoute,
    sidebarRoute.addChildren([
      dashboardRoute.addChildren([dashboardIndexRoute]),
      settingsRoute,
      fileBoardRoute.addChildren([fileBoardIndexRoute, fileItemRoute]),
      ...workspacePages
        .filter((page) => page.path !== "file-board")
        .map((page) =>
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
