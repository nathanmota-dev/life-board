import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

export type SealedSecret = { ciphertext: string; iv: string; tag: string }

/**
 * AES-256-GCM for secrets stored at rest (the GitHub token). The key never
 * touches the API's data dir: Electron keeps it wrapped by the OS keyring
 * (`safeStorage`) and hands it to the backend at startup.
 */
export class CryptoService {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) throw new Error(`Encryption key must be ${KEY_BYTES} bytes.`)
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

