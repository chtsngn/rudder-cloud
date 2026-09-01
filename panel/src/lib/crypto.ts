/**
 * S3 secret'ları (Aşama D) veritabanında DÜZ METİN olarak ASLA saklanmaz —
 * bu modül AES-256-GCM ile şifreler/çözer. Anahtar `SETTINGS_ENCRYPTION_KEY`
 * ortam değişkeninden (install.sh tarafından `openssl rand -base64 32` ile
 * üretilir) `scrypt` ile 32 bayta indirgenir. Yalnızca sunucu tarafında
 * (`node:crypto`) kullanılır — asla client component'e import edilmemeli.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"

const ALGO = "aes-256-gcm"
// Sabit bir "salt" — burada şifreleme anahtarının kendisi zaten yüksek
// entropili, rastgele üretilmiş bir sır (SETTINGS_ENCRYPTION_KEY); salt'ın
// tek işi bu sırı scrypt ile sabit 32 baytlık bir AES anahtarına çevirmek,
// düşük entropili bir kullanıcı şifresini korumak değil.
const SCRYPT_SALT = "panel-settings-encryption-v1"

export class CryptoConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CryptoConfigError"
  }
}

function getKey(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY
  if (!secret) {
    throw new CryptoConfigError(
      "SETTINGS_ENCRYPTION_KEY tanımlı değil — .env dosyasına ekleyin (bkz. .env.example, `openssl rand -base64 32`)."
    )
  }
  return scryptSync(secret, SCRYPT_SALT, 32)
}

/** `iv:authTag:ciphertext` biçiminde (hepsi base64) tek bir string döndürür — DB'ye böyle yazılır. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":")
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(":")
  if (parts.length !== 3) {
    throw new CryptoConfigError("Şifreli değer bozuk (beklenmeyen biçim).")
  }
  const [ivB64, tagB64, dataB64] = parts
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(tagB64, "base64")
  const data = Buffer.from(dataB64, "base64")
  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8")
}
