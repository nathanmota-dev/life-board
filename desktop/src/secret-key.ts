import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { safeStorage } from "electron"

const KEY_BYTES = 32
// Only the OS keyring can unwrap this file (libsecret/kwallet, Keychain, DPAPI).
const KEY_FILE = "secret.key.enc"
// Windows keeps the safeStorage key in Chromium's `Local State`, which is saved
// lazily and Electron can't flush. A new key stays pending until a later start
// decrypts it, so a kill before that save can't lock the app out.
const PENDING_FILE = "secret.key.pending"
// Secrets sealed with a previous key can't be opened; the backend drops them
// before this marker is cleared.
const RESET_FILE = "secret.key.reset"

export type SecretKey = { key: Buffer; resetSecrets: boolean }

/** The key file exists but the keyring can't decrypt it; only a reset recovers. */
export class UnreadableSecretKeyError extends Error {}

/**
 * Loads the AES key that encrypts secrets in the database, creating it on
 * first run. Must be called after `app` is ready.
 */
export function loadSecretKey(dataDir: string): SecretKey {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("O chaveiro do sistema não está disponível para proteger a chave.")
  }
  // `basic_text` uses a password hardcoded in Chromium, which protects nothing.
  if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") {
    throw new Error("Nenhum chaveiro do sistema encontrado (instale o gnome-keyring ou o KWallet).")
  }

  const keyPath = join(dataDir, KEY_FILE)
  if (!existsSync(keyPath)) return { key: createKey(dataDir), resetSecrets: true }

  let key: Buffer
  try {
    key = Buffer.from(safeStorage.decryptString(readFileSync(keyPath)), "base64")
    if (key.length !== KEY_BYTES) throw new Error("A chave salva está corrompida.")
  } catch (error) {
    if (!existsSync(join(dataDir, PENDING_FILE))) {
      throw new UnreadableSecretKeyError("Não foi possível decifrar a chave dos segredos.", { cause: error })
    }
    console.warn("A chave criada no último início não foi salva pelo chaveiro; criando outra.", error)
    return { key: resetSecretKey(dataDir), resetSecrets: true }
  }
  rmSync(join(dataDir, PENDING_FILE), { force: true })
  return { key, resetSecrets: existsSync(join(dataDir, RESET_FILE)) }
}

/** Replaces the key; secrets sealed with the old one must be dropped (`resetSecrets`). */
export function resetSecretKey(dataDir: string) {
  return createKey(dataDir)
}

/** Called once the backend has dropped the secrets sealed with a previous key. */
export function confirmSecretsReset(dataDir: string) {
  rmSync(join(dataDir, RESET_FILE), { force: true })
}

function createKey(dataDir: string) {
  const key = randomBytes(KEY_BYTES)
  mkdirSync(dataDir, { recursive: true })
  // Markers first, so a crash at any point still resets on the next start.
  writeFileSync(join(dataDir, RESET_FILE), "")
  if (process.platform === "win32") writeFileSync(join(dataDir, PENDING_FILE), "")
  const keyPath = join(dataDir, KEY_FILE)
  writeFileSync(`${keyPath}.tmp`, safeStorage.encryptString(key.toString("base64")), { mode: 0o600 })
  renameSync(`${keyPath}.tmp`, keyPath)
  return key
}
