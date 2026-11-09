import type { OrderSnapshot, Tenant } from '../domain'
import type { Money } from '../shared'

export interface OrderItemInput {
  name: string
  sku: string
  quantity: number
  unitAmount: Money
  tax: Money
}

export interface CreateOrderInput {
  requestId: string // idempotency, e.g. "create-chk_123"
  referenceId: string
  customId: string // mandate fingerprint
  invoiceId: string
  description: string
  currency: 'USD'
  itemTotal: Money
  shipping: Money
  taxTotal: Money
  total: Money
  items: OrderItemInput[]
}

export interface OrderView extends OrderSnapshot {
  id: string
}

export interface CaptureResult {
  captureId: string
  status: string // COMPLETED | PENDING | DECLINED
  payerId: string | null
}

export interface TrackingInput {
  orderId: string
  captureId: string
  carrier: string
  trackingNumber: string
  items: Array<{ name: string; sku: string; quantity: number }>
}

export interface RefundInput {
  requestId: string
  captureId: string
  amount: Money
  currency: 'USD'
  noteToPayer: string
}

export interface PayoutInput {
  batchId: string // unique; PayPal rejects duplicates
  itemId: string
  receiverEmail: string
  amount: Money
  currency: 'USD'
  subject: string
  note: string
}

export interface WebhookCheck {
  webhookId: string
  headers: Record<string, string | undefined>
  event: unknown
}

/** Everything Sayso asks of PayPal, on behalf of one tenant. */
export interface PaymentsGateway {
  createOrder(input: CreateOrderInput): Promise<{ orderId: string; status: string }>
  getOrder(orderId: string): Promise<OrderView>
  captureOrder(orderId: string, requestId: string): Promise<CaptureResult>
  addTracking(input: TrackingInput): Promise<{ trackerId: string | null }>
  refundCapture(input: RefundInput): Promise<{ refundId: string; status: string }>
  createPayout(input: PayoutInput): Promise<{ payoutBatchId: string; status: string }>
  getPayoutStatus(payoutBatchId: string): Promise<string>
  verifyWebhook(input: WebhookCheck): Promise<boolean>
}

export interface PaymentsProvider {
  readonly mode: 'paypal' | 'fake'
  forTenant(tenant: Tenant): PaymentsGateway
  /** The public client ID the browser needs for the PayPal button. */
  publicClientId(tenant: Tenant): string | null
}

/** Only the fake driver implements this: it stands in for the buyer's PayPal popup. */
export interface PaymentsSimulator {
  approveOrder(orderId: string, payerId: string): Promise<void>
  /** For tests: change an approved order's amount to prove the pre-capture check. */
  tamperAmount(orderId: string, amount: Money): Promise<void>
}
