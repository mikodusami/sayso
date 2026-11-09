/** Encrypts tenant secrets (PayPal client secrets) at rest. */
export interface SecretBox {
  encrypt(plain: string): string
  decrypt(sealed: string): string
}

export type LinkAction = 'approve_mandate' | 'pay_checkout' | 'demo_session'

export interface LinkClaims {
  action: LinkAction
  subject: string // mandate id, checkout id, or tenant id for demo sessions
  exp: number // unix seconds
}

/** Short-lived signed tokens for hosted pages and demo sessions. */
export interface TokenSigner {
  sign(claims: Omit<LinkClaims, 'exp'>, ttlSeconds: number): string
  verify(token: string): LinkClaims | null
}

/** One-way hashing for API keys. */
export interface KeyHasher {
  hash(secret: string): string
}

/** HMAC signatures for outgoing webhooks. */
export interface PayloadSigner {
  signature(secret: string, timestamp: number, body: string): string
}
