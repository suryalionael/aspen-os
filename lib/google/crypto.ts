import crypto from "crypto"

import { getGoogleConfig } from "@/lib/google/config"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getKey(): Buffer {
  const { encryptionKey } = getGoogleConfig()
  return crypto.scryptSync(encryptionKey, "aspen-google-tokens-salt", 32)
}

export function encryptToken(token: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(token, "utf8", "hex")
  encrypted += cipher.final("hex")
  const tag = cipher.getAuthTag()

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`
}

export function decryptToken(encryptedToken: string): string {
  const key = getKey()
  const parts = encryptedToken.split(":")

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format")
  }

  const iv = Buffer.from(parts[0], "hex")
  const tag = Buffer.from(parts[1], "hex")
  const encrypted = parts[2]

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}
