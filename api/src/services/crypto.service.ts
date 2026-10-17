import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

export type SealedSecret = { ciphertext: string; iv: string; tag: string }

/** AES-256-GCM for secrets stored at rest (the GitHub token). */
export class CryptoService {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) throw new Error(`Encryption key must be ${KEY_BYTES} bytes.`)
  }

  /**
   * Uses LIFEBOARD_SECRET_KEY (base64 or hex, 32 bytes) when set. Otherwise
   * a key is generated once and kept in `<dataDir>/secret.key`, readable
   * only by the current user.
   */
  static fromEnvOrFile(dataDir: string, envKey = process.env.LIFEBOARD_SECRET_KEY) {
    if (envKey) return new CryptoService(decodeKey(envKey))

    const keyPath = join(dataDir, "secret.key")
    if (existsSync(keyPath)) return new CryptoService(Buffer.from(readFileSync(keyPath, "utf8").trim(), "base64"))

    const key = randomBytes(KEY_BYTES)
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 })
    return new CryptoService(key)
  }

  seal(plaintext: string): SealedSecret {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    }
  }

  open(sealed: SealedSecret): string {
    const iv = Buffer.from(sealed.iv, "base64")
    const tag = Buffer.from(sealed.tag, "base64")
    if (iv.length !== IV_BYTES) throw new Error("Invalid IV length.")
    if (tag.length !== TAG_BYTES) throw new Error("Invalid auth tag length.")
    const decipher = createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8")
  }
}

function decodeKey(raw: string) {
  const base64 = Buffer.from(raw, "base64")
  if (base64.length === KEY_BYTES) return base64
  const hex = Buffer.from(raw, "hex")
  if (hex.length === KEY_BYTES) return hex
  // Any other string still yields a stable key, so the same value keeps decrypting.
  return createHash("sha256").update(raw).digest()
}
