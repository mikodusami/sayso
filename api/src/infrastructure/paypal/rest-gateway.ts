import type { Tenant } from '../../domain'
import type { PaymentsGateway, PaymentsProvider, SecretBox } from '../../ports'
import { AppError } from '../../shared'

type Fetch = typeof fetch

interface Credentials {
  clientId: string
  secret: string
}

interface CachedToken {
  value: string
  expiresAt: number
}

/** Talks to the PayPal REST API (sandbox by default) for one tenant's REST app. */
export class PayPalRestClient {
  private static tokens = new Map<string, CachedToken>()

  constructor(
    private readonly apiBase: string,
    private readonly creds: Credentials,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async token(): Promise<string> {
    const cached = PayPalRestClient.tokens.get(this.creds.clientId)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.secret}`).toString('base64')
    const res = await this.fetchImpl(`${this.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    })
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string }
    if (!res.ok || !body.access_token) {
      throw new AppError('paypal_error', `PayPal login failed: ${body.error_description ?? res.status}`)
    }
    // Refresh a minute early.
    PayPalRestClient.tokens.set(this.creds.clientId, {
      value: body.access_token,
      expiresAt: Date.now() + ((body.expires_in ?? 300) - 60) * 1000,
    })
    return body.access_token
  }

  async request<T>(method: 'GET' | 'POST', path: string, options: { body?: unknown; requestId?: string } = {}): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.token()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }
    if (options.requestId) headers['PayPal-Request-Id'] = options.requestId
    const res = await this.fetchImpl(`${this.apiBase}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (!res.ok) {
      const issue = data?.details?.[0]?.issue ?? data?.name ?? res.status
      throw new AppError('paypal_error', `PayPal ${method} ${path} failed: ${issue}`, {
        status: res.status,
        debugId: data?.debug_id ?? null,
        details: data?.details ?? null,
      })
    }
    return data as T
  }
}

interface PayPalOrder {
  id: string
  status: string
  payer?: { payer_id?: string }
  purchase_units?: Array<{
    custom_id?: string
    amount?: { value: string; currency_code: string }
    payments?: { captures?: Array<{ id: string; status: string }> }
    shipping?: { trackers?: Array<{ id: string }> }
  }>
}

export function createRestGateway(client: PayPalRestClient): PaymentsGateway {
  return {
    async createOrder(input) {
      const money = (value: string) => ({ currency_code: input.currency, value })
      const order = await client.request<PayPalOrder>('POST', '/v2/checkout/orders', {
        requestId: input.requestId,
        body: {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: input.referenceId,
              custom_id: input.customId,
              invoice_id: input.invoiceId,
              description: input.description.slice(0, 127),
              amount: {
                ...money(input.total),
                breakdown: { item_total: money(input.itemTotal), shipping: money(input.shipping), tax_total: money(input.taxTotal) },
              },
              items: input.items.map((item) => ({
                name: item.name.slice(0, 127),
                sku: item.sku,
                quantity: String(item.quantity),
                unit_amount: money(item.unitAmount),
                tax: money(item.tax),
                category: 'PHYSICAL_GOODS',
              })),
            },
          ],
        },
      })
      return { orderId: order.id, status: order.status }
    },

    async getOrder(orderId) {
      const order = await client.request<PayPalOrder>('GET', `/v2/checkout/orders/${orderId}`)
      const unit = order.purchase_units?.[0]
      return {
        id: order.id,
        status: order.status,
        amount: unit?.amount?.value ?? '0.00',
        currency: unit?.amount?.currency_code ?? '',
        customId: unit?.custom_id ?? null,
        payerId: order.payer?.payer_id ?? null,
      }
    },

    async captureOrder(orderId, requestId) {
      const order = await client.request<PayPalOrder>('POST', `/v2/checkout/orders/${orderId}/capture`, { requestId, body: {} })
      const capture = order.purchase_units?.[0]?.payments?.captures?.[0]
      if (!capture) throw new AppError('paypal_error', 'PayPal capture returned no capture')
      return { captureId: capture.id, status: capture.status, payerId: order.payer?.payer_id ?? null }
    },

    async addTracking(input) {
      const order = await client.request<PayPalOrder>('POST', `/v2/checkout/orders/${input.orderId}/track`, {
        body: {
          capture_id: input.captureId,
          tracking_number: input.trackingNumber,
          carrier: input.carrier,
          notify_payer: false,
          items: input.items.map((i) => ({ name: i.name, sku: i.sku, quantity: String(i.quantity) })),
        },
      })
      const trackers = order.purchase_units?.[0]?.shipping?.trackers ?? []
      return { trackerId: trackers[trackers.length - 1]?.id ?? null }
    },

    async refundCapture(input) {
      const refund = await client.request<{ id: string; status: string }>('POST', `/v2/payments/captures/${input.captureId}/refund`, {
        requestId: input.requestId,
        body: { amount: { value: input.amount, currency_code: input.currency }, note_to_payer: input.noteToPayer.slice(0, 255) },
      })
      return { refundId: refund.id, status: refund.status }
    },

    async createPayout(input) {
      const res = await client.request<{ batch_header: { payout_batch_id: string; batch_status: string } }>('POST', '/v1/payments/payouts', {
        body: {
          sender_batch_header: { sender_batch_id: input.batchId, email_subject: input.subject, recipient_type: 'EMAIL' },
          items: [
            {
              amount: { value: input.amount, currency: input.currency },
              receiver: input.receiverEmail,
              sender_item_id: input.itemId,
              note: input.note,
            },
          ],
        },
      })
      return { payoutBatchId: res.batch_header.payout_batch_id, status: res.batch_header.batch_status }
    },

    async getPayoutStatus(payoutBatchId) {
      const res = await client.request<{ batch_header: { batch_status: string } }>('GET', `/v1/payments/payouts/${payoutBatchId}`)
      return res.batch_header.batch_status
    },

    async verifyWebhook({ webhookId, headers, event }) {
      const res = await client.request<{ verification_status: string }>('POST', '/v1/notifications/verify-webhook-signature', {
        body: {
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: webhookId,
          webhook_event: event,
        },
      })
      return res.verification_status === 'SUCCESS'
    },
  }
}

export function createRestPaymentsProvider(options: { apiBase: string; secretBox: SecretBox; fetchImpl?: Fetch }): PaymentsProvider {
  return {
    mode: 'paypal',
    forTenant(tenant: Tenant) {
      if (!tenant.paypal) throw new AppError('invalid_request', `${tenant.name} has no PayPal credentials configured`)
      const secret = options.secretBox.decrypt(tenant.paypal.secretEnc)
      return createRestGateway(new PayPalRestClient(options.apiBase, { clientId: tenant.paypal.clientId, secret }, options.fetchImpl))
    },
    publicClientId: (tenant) => tenant.paypal?.clientId ?? null,
  }
}
