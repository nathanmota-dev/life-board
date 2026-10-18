import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { safeStorage } from "electron"

const KEY_BYTES = 32
// Only the OS keyring can unwrap this file (libsecret/kwallet, Keychain, DPAPI).
const KEY_FILE = "secret.key.enc"

/**
 * Loads the AES key that encrypts secrets in the database, creating it on
 * first run. Must be called after `app` is ready.
 */
export function loadSecretKey(dataDir: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("O chaveiro do sistema não está disponível para proteger a chave.")
  }
  // `basic_text` uses a password hardcoded in Chromium, which protects nothing.
  if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") {
    throw new Error("Nenhum chaveiro do sistema encontrado (instale o gnome-keyring ou o KWallet).")
  }

  const keyPath = join(dataDir, KEY_FILE)
  if (existsSync(keyPath)) {
    const key = Buffer.from(safeStorage.decryptString(readFileSync(keyPath)), "base64")
    if (key.length !== KEY_BYTES) throw new Error("A chave salva está corrompida.")
    return key
  }

  const key = randomBytes(KEY_BYTES)
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(keyPath, safeStorage.encryptString(key.toString("base64")), { mode: 0o600 })
  return key
}
