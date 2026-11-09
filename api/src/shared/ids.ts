import { randomBytes } from 'node:crypto'

export const ID_PREFIX = {
  tenant: 'ten',
  apiKey: 'key',
  shopper: 'shp',
  agent: 'agt',
  product: 'prd',
  mandate: 'mdt',
  checkout: 'chk',
  shipment: 'shi',
  complaint: 'cmp',
  finding: 'fnd',
  event: 'evt',
  webhookEndpoint: 'whe',
} as const

export type IdKind = keyof typeof ID_PREFIX

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'

/** Random, URL-safe id with a readable prefix, e.g. "mdt_k3j9x0q2m1v8". */
export function newId(kind: IdKind, length = 14): string {
  const bytes = randomBytes(length)
  let body = ''
  for (const byte of bytes) body += alphabet[byte % alphabet.length]
  return `${ID_PREFIX[kind]}_${body}`
}

/** Secret API key: "sk_test_<scope>_<random>". */
export function newApiKeySecret(scope: 'merch' | 'agent'): string {
  return `sk_test_${scope}_${randomBytes(24).toString('base64url')}`
}

/** A random secret with a readable prefix, e.g. "whsec_..." for webhook signing. */
export function newSecret(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString('base64url')}`
}
