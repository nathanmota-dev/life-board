import { Home, Settings } from "lucide-react"
import { workspacePages } from "@/routes/workspace-pages"

export const navigationItems = [
  { to: "/dashboard", title: "Dashboard", icon: Home },
  ...workspacePages.map((page) => ({
    to: `/${page.path}` as const,
    title: page.title,
    icon: page.icon,
  })),
  { to: "/settings", title: "Settings", icon: Settings },
] as const
