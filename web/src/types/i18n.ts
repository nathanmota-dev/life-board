import type en from "../../../public/i18n/en.json"

export type Language = "pt" | "en"

export type NavigationTitleKey = `navigation.${keyof typeof en.navigation}`

export type ErrorTranslationKey = `errors.${keyof typeof en.errors}`

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: { translation: typeof en }
  }
}
