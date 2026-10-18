import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, CornerDownLeft } from "lucide-react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSidebar } from "@/components/ui/sidebar"
import { navigationItems } from "@/routes/navigation-items"
import type { CommandPaletteContextValue, WithChildren } from "@/types/ui"

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext)
  if (!context) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider")
  }
  return context
}

export function CommandPaletteProvider({ children }: WithChildren) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"

  const openSearch = useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    setOpenMobile(false)
    setOpen(true)
  }, [setOpenMobile])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey && !event.repeat && !event.isComposing
      ) {
        event.preventDefault()
        if (open) setOpen(false)
        else openSearch()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, openSearch])

  return (
    <CommandPaletteContext.Provider value={{ openSearch, shortcut }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[15%] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const opener = openerRef.current
            if (opener?.isConnected) opener.focus()
            else document.querySelector<HTMLElement>('header [data-sidebar="trigger"]')?.focus()
          }}
        >
          <DialogTitle className="sr-only">{t("search.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("search.description")}
          </DialogDescription>
          <Command loop className="**:data-[slot=command-input-wrapper]:h-12">
            <div className="relative">
              <CommandInput
                aria-label={t("search.title")}
                placeholder={t("search.placeholder")}
                className="h-12 pr-12"
              />
              <DialogClose
                aria-label={t("search.close")}
                className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer rounded border px-1 text-[10px] text-muted-foreground hover:bg-accent focus-visible:outline-ring"
              >
                Esc
              </DialogClose>
            </div>
            <CommandList className="max-h-[min(360px,55dvh)] p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <CommandEmpty>{t("search.empty")}</CommandEmpty>
              <CommandGroup heading={t("search.goTo")}>
                {navigationItems.map((item) => (
                  <CommandItem
                    key={item.to}
                    value={t(item.titleKey)}
                    keywords={[item.to]}
                    className="h-10 cursor-pointer rounded-lg gap-3 px-2.5"
                    onSelect={() => {
                      void navigate({ to: item.to })
                      setOpen(false)
                    }}
                  >
                    <item.icon className="size-4" strokeWidth={1.7} />
                    <span className="min-w-0 truncate">{t(item.titleKey)}</span>
                    <span aria-hidden="true" className="ml-auto shrink-0 font-mono text-xs tracking-wide text-muted-foreground">
                      {item.to}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="flex items-center gap-4 border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="rounded border p-0.5"><ArrowUp className="size-3" /></kbd>
                <kbd className="rounded border p-0.5"><ArrowDown className="size-3" /></kbd>
                {t("search.navigate")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border p-0.5"><CornerDownLeft className="size-3" /></kbd>
                {t("search.open")}
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </CommandPaletteContext.Provider>
  )
}
