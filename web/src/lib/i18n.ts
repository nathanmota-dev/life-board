import { createInstance } from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"
import { syncDesktopLanguage } from "@/lib/desktop-app"
import en from "../../../public/i18n/en.json"
import pt from "../../../public/i18n/pt.json"
import type { Language } from "@/types/i18n"
import type { SegmentedOption } from "@/types/ui"

export const LANGUAGE_STORAGE_KEY = "life-board-language"

export const LANGUAGE_OPTIONS: SegmentedOption<Language>[] = [
  { value: "pt", label: "PT" },
  { value: "en", label: "EN" },
]

export const i18n = createInstance()

export function getLocale() {
  return i18n.resolvedLanguage === "pt" ? "pt-BR" : "en"
}

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language.startsWith("pt") ? "pt-BR" : "en"
  syncDesktopLanguage(language)
})

// Bundle both dictionaries so the packaged Electron app also works offline over file://.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, pt: { translation: pt satisfies typeof en } },
    supportedLngs: LANGUAGE_OPTIONS.map(({ value }) => value),
    fallbackLng: "en",
    load: "languageOnly",
    initAsync: false,
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  })
