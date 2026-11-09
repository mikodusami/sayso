import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { MandateBody } from './schema'

export const FINGERPRINT_PREFIX = 'sy1.'

/** RFC 8785 canonical JSON: sorted keys, no whitespace. Same content -> same bytes. */
export function canonicalJson(body: MandateBody): string {
  const parsed = MandateBody.parse(body)
  const text = canonicalize(parsed)
  if (text === undefined) throw new Error('Mandate cannot be canonicalised')
  return text
}

/** "sy1." + SHA-256 hex = 68 characters, inside PayPal's 127-character custom_id. */
export function fingerprintOf(canonical: string): string {
  return FINGERPRINT_PREFIX + createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/** Recompute from stored text before every use. A mismatch means tampering. */
export function verifyFingerprint(canonical: string, fingerprint: string): boolean {
  return fingerprintOf(canonical) === fingerprint
}

export function shortFingerprint(fingerprint: string): string {
  const hex = fingerprint.slice(FINGERPRINT_PREFIX.length)
  return `${FINGERPRINT_PREFIX}${hex.slice(0, 4)}…${hex.slice(-3)}`
}
