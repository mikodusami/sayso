import type { WebhookEndpoint } from '../domain'

export interface OutboundEvent {
  id: string
  type: string // e.g. "finding.created"
  createdAt: string
  data: Record<string, unknown>
}

/** Delivers Sayso events to a tenant's registered webhook URL. */
export interface EventNotifier {
  deliver(endpoint: WebhookEndpoint, event: OutboundEvent): Promise<{ ok: boolean; status: number | null }>
}
