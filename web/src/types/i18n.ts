import type en from "../../../public/i18n/en.json"

export type Language = "pt" | "en"

/** Day/month order for numeric dates: 21/11/2026 or 11/21/2026. */
export type DateFormat = "dmy" | "mdy"

export type NavigationTitleKey = `navigation.${keyof typeof en.navigation}`

export type ErrorTranslationKey = `errors.${keyof typeof en.errors}`

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: { translation: typeof en }
  }
}
