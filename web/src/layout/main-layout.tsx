import { Outlet } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { AccentProvider } from "@/components/accent-provider"
import { AppSidebar } from "@/components/app-sidebar"
import { CommandPaletteProvider } from "@/components/command-palette"
import { ModeToggle } from "@/components/mode-toggle"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/shared/toaster"
import { RouteBreadcrumb } from "@/layout/route-breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

function WorkspaceHeader() {
  const { t } = useTranslation()
  const { state, isMobile } = useSidebar()
  const showSidebarTrigger = state === "collapsed" || isMobile

  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b px-4">
      {showSidebarTrigger && (
        <>
          <SidebarTrigger
            aria-label={t("navigation.openSidebar")}
            className="size-8 shrink-0 rounded-lg text-muted-foreground"
          />
          <Separator orientation="vertical" className="mx-1 h-4!" />
        </>
      )}
      <RouteBreadcrumb />
      <ModeToggle />
    </header>
  )
}

export function MainLayout() {
  return (
    <ThemeProvider>
      <AccentProvider>
        <SidebarProvider className="h-svh min-h-0 overflow-hidden bg-background">
          <CommandPaletteProvider>
            <AppSidebar />
            <SidebarInset className="min-h-0 min-w-0 overflow-hidden border border-border shadow-xs">
              <WorkspaceHeader />
              <div className="flex min-h-0 flex-1 overflow-auto">
                <Outlet />
              </div>
            </SidebarInset>
            <Toaster />
          </CommandPaletteProvider>
        </SidebarProvider>
      </AccentProvider>
    </ThemeProvider>
  )
}
