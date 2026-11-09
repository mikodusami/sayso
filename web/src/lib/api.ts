// The only module that talks to the Sayso API.

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

export interface Auth {
  /** Demo session token (merchant or agent provider console). */
  demo?: string
  /** Hosted page link token (shopper). */
  link?: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string,
    readonly details: Record<string, unknown>,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; auth?: Auth; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.auth?.demo) headers.Authorization = `Demo ${options.auth.demo}`
  if (options.auth?.link) headers['X-Sayso-Link'] = options.auth.link
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const { type = 'error', message = `Request failed (${res.status})`, ...details } = data.error ?? {}
    throw new ApiError(res.status, type, message, details)
  }
  return data as T
}

// ---- response shapes used by the UI (subset of the API) ----------------------

export interface Check {
  name: string
  result: 'pass' | 'fail' | 'ask'
  reason: string
  source: 'code' | 'ai'
  field?: string
}

export interface CardLine {
  label: string
  value: string
}

export interface Quote {
  sku: string
  quantity: number
  itemTotal: string
  shipping: string
  tax: string
  total: string
  arrivesBy: string
}

export interface Checkout {
  id: string
  status: 'needs_shopper' | 'ready_for_payment' | 'blocked' | 'paid' | 'failed'
  mandate_id: string
  agent_id: string
  product_title: string
  quote: Quote
  checks: Check[]
  ai_judged_fields: string[]
  flagged: boolean
  override: { warnings: string[] } | null
  paypal_order_id: string | null
  capture_id: string | null
  failure_reason: string | null
  created_at: string
  pay_url?: string
}

export interface Mandate {
  id: string
  status: string
  fingerprint: string
  fingerprint_short: string
  card: CardLine[]
  original_text: string
  expires_at: string
}

export interface Finding {
  id: string
  checkout_id: string
  rule: string
  fault: string
  action: string
  explanation: string
  amount: string
  status: string
  refund_id: string | null
  payout_batch_id: string | null
  failure_reason: string | null
  created_at: string
}

export interface TimelineEvent {
  id: string
  at: string
  kind: string
  actor: string
  message: string
  paypal_ref: string | null
}

export const linkTokenOf = (url: string) => new URL(url).searchParams.get('t') ?? ''
export const pathOf = (url: string) => {
  const u = new URL(url)
  return `${u.pathname}${u.search}`
}
