import type { ReactElement } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { render } from "@testing-library/react"
import { AccentProvider } from "@/components/accent-provider"
import { ThemeProvider } from "@/components/theme-provider"

/**
 * Renders `ui` with the providers every page relies on (React Query, theme,
 * accent) inside a router, since several pages use `<Link>`.
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => ui })
  const catchAll = createRoute({ getParentRoute: () => rootRoute, path: "$", component: () => null })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute, catchAll]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AccentProvider>
            <RouterProvider router={router} />
          </AccentProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    ),
  }
}
