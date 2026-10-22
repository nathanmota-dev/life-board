import { dialog } from "electron"
import { t } from "./locale"
import { loadSecretKey, resetSecretKey, UnreadableSecretKeyError } from "./secret-key"
import type { SecretKey } from "./secret-key"

/**
 * Loads the secret key, or asks the user to replace it when the keyring can't
 * decrypt it. Returns null when the app must quit. Failures are logged before
 * any dialog, so a blocked start still shows up in the logs.
 */
export function openSecretKey(dataDir: string): SecretKey | null {
  try {
    return loadSecretKey(dataDir)
  } catch (error) {
    console.error("Não foi possível carregar a chave dos segredos:", error)
    if (!(error instanceof UnreadableSecretKeyError)) {
      dialog.showErrorBox("Life Board", (error as Error).message)
      return null
    }
  }

  const choice = dialog.showMessageBoxSync({
    type: "warning",
    title: "Life Board",
    message: t("secretKey.unreadable"),
    detail: t("secretKey.unreadableDetail"),
    buttons: [t("secretKey.reset"), t("secretKey.quit")],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  if (choice !== 0) return null
  console.warn("Chave dos segredos redefinida; os segredos cifrados com a anterior serão apagados.")
  return { key: resetSecretKey(dataDir), resetSecrets: true }
}
