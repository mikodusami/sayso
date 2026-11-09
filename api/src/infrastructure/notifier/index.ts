import type { EventNotifier, PayloadSigner } from '../../ports'

/**
 * POSTs a Sayso event to a tenant's webhook URL with
 * "Sayso-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + '.' + body)>".
 * One attempt with a 5 s timeout; failures are reported, not thrown.
 */
export function createHttpNotifier(signer: PayloadSigner, fetchImpl: typeof fetch = fetch): EventNotifier {
  return {
    async deliver(endpoint, event) {
      const body = JSON.stringify(event)
      const timestamp = Math.floor(Date.now() / 1000)
      try {
        const res = await fetchImpl(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Sayso-Signature': `t=${timestamp},v1=${signer.signature(endpoint.secret, timestamp, body)}`,
          },
          body,
          signal: AbortSignal.timeout(5000),
        })
        return { ok: res.ok, status: res.status }
      } catch {
        return { ok: false, status: null }
      }
    },
  }
}

/** Records deliveries in memory. Used by tests. */
export function createRecordingNotifier() {
  const delivered: Array<{ url: string; type: string; data: Record<string, unknown> }> = []
  const notifier: EventNotifier = {
    async deliver(endpoint, event) {
      delivered.push({ url: endpoint.url, type: event.type, data: event.data })
      return { ok: true, status: 200 }
    },
  }
  return { notifier, delivered }
}
