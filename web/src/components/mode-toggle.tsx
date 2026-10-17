import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"
  const label = isDark ? "Ativar tema claro" : "Ativar tema escuro"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className="ml-auto cursor-pointer text-muted-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M12 8l4.04-4.04M12 13l6.84-6.84M12 18l8.61-8.61M14.3 20.7l6.4-6.4" />
      </svg>
    </Button>
  )
}
