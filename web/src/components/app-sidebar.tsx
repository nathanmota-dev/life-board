import { Link, useMatchRoute } from "@tanstack/react-router"
import { LayoutDashboard, Search, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCommandPalette } from "@/components/command-palette"
import { navigationItems } from "@/routes/navigation-items"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

const mainNavigationItems = navigationItems.filter((item) => item.to !== "/settings")

export function AppSidebar() {
  const matchRoute = useMatchRoute()
  const { setOpenMobile } = useSidebar()
  const { openSearch, shortcut } = useCommandPalette()

  return (
    <Sidebar variant="inset" collapsible="icon" aria-label="Navegação principal">
      <SidebarHeader className="gap-4 px-0 pb-0 pt-2">
        <div className="flex h-8 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsible=icon]:flex-none">
            <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <LayoutDashboard className="size-3.5" strokeWidth={2.2} />
            </span>
            <span className="truncate text-sm font-medium group-data-[collapsible=icon]:hidden">LifeBoard</span>
          </div>
          <SidebarTrigger
            aria-label="Alternar sidebar"
            className="size-8 shrink-0 rounded-lg text-muted-foreground group-data-[collapsible=icon]:hidden"
          />
        </div>
        <Button
          variant="outline"
          aria-label="Buscar na navegação"
          aria-haspopup="dialog"
          className="h-8 w-full cursor-pointer justify-start gap-2 rounded-lg px-2.5 text-xs font-normal text-muted-foreground shadow-xs group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
          onClick={openSearch}
        >
          <Search className="size-3.5" strokeWidth={1.7} />
          <span className="truncate group-data-[collapsible=icon]:hidden">Search anything...</span>
          <kbd className="ml-auto shrink-0 rounded border px-1 text-[10px] group-data-[collapsible=icon]:hidden">{shortcut}</kbd>
        </Button>
      </SidebarHeader>
      <SidebarContent className="gap-0 pt-4">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu aria-label="Páginas">
              {mainNavigationItems.map((item) => (
                <SidebarMenuItem key={item.to} className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
                  <SidebarMenuButton
                    asChild
                    isActive={Boolean(matchRoute({ to: item.to, fuzzy: true }))}
                    tooltip={item.title}
                    className="rounded-lg font-normal data-[active=true]:font-normal [&>svg]:stroke-[1.7]"
                  >
                    <Link
                      to={item.to}
                      aria-label={item.title}
                      className="cursor-pointer"
                      activeProps={{ "aria-current": "page" }}
                      onClick={() => setOpenMobile(false)}
                    >
                      <item.icon />
                      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t px-0 pb-1 pt-2">
        <SidebarMenu>
          <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <SidebarMenuButton
              asChild
              isActive={Boolean(matchRoute({ to: "/settings", fuzzy: true }))}
              tooltip="Settings"
              className="rounded-lg font-normal data-[active=true]:font-normal [&>svg]:stroke-[1.7]"
            >
              <Link
                to="/settings"
                aria-label="Settings"
                className="cursor-pointer"
                activeProps={{ "aria-current": "page" }}
                onClick={() => setOpenMobile(false)}
              >
                <Settings />
                <span className="group-data-[collapsible=icon]:hidden">Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
