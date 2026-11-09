import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { KeyHasher, LinkClaims, PayloadSigner, SecretBox, TokenSigner } from '../../ports'

/** AES-256-GCM. Output: iv.tag.ciphertext, each base64url. */
export function createSecretBox(base64Key: string): SecretBox {
  const key = Buffer.from(base64Key, 'base64')
  if (key.length !== 32) throw new Error('SAYSO_ENCRYPTION_KEY must be 32 bytes, base64-encoded')
  return {
    encrypt(plain) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')
    },
    decrypt(sealed) {
      const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'))
      if (!iv || !tag || !data) throw new Error('Malformed sealed secret')
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    },
  }
}

/** HMAC-SHA256 signed claims: base64url(json).base64url(signature). */
export function createTokenSigner(secret: string, now: () => Date = () => new Date()): TokenSigner {
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url')
  return {
    sign(claims, ttlSeconds) {
      const full: LinkClaims = { ...claims, exp: Math.floor(now().getTime() / 1000) + ttlSeconds }
      const payload = Buffer.from(JSON.stringify(full)).toString('base64url')
      return `${payload}.${sign(payload)}`
    },
    verify(token) {
      const [payload, signature] = token.split('.')
      if (!payload || !signature) return null
      const expected = Buffer.from(sign(payload))
      const given = Buffer.from(signature)
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
      try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LinkClaims
        return claims.exp > now().getTime() / 1000 ? claims : null
      } catch {
        return null
      }
    },
  }
}

export const sha256Hasher: KeyHasher = {
  hash: (secret) => createHash('sha256').update(secret).digest('hex'),
}

export const hmacPayloadSigner: PayloadSigner = {
  signature: (secret, timestamp, body) => createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'),
}
