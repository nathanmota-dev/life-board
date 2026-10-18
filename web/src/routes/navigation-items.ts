import { Home, Settings } from "lucide-react"
import { workspacePages } from "@/routes/workspace-pages"

export const navigationItems = [
  { to: "/dashboard", titleKey: "navigation.dashboard", icon: Home },
  ...workspacePages.map((page) => ({
    to: `/${page.path}` as const,
    titleKey: page.titleKey,
    icon: page.icon,
  })),
  { to: "/settings", titleKey: "navigation.settings", icon: Settings },
] as const
