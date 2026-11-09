import { randomBytes } from 'node:crypto'
import type { PaymentsGateway, PaymentsProvider, PaymentsSimulator } from '../../ports'
import { AppError } from '../../shared'

// An in-memory stand-in for the PayPal sandbox. It follows the same state
// rules (CREATED -> APPROVED -> COMPLETED, refunds need a capture, request IDs
// are idempotent) so the whole product runs and is testable with no accounts.

interface FakeOrder {
  id: string
  tenantId: string
  status: 'CREATED' | 'APPROVED' | 'COMPLETED'
  amount: string
  currency: string
  customId: string
  payerId: string | null
  captureId: string | null
}

const fakeId = (prefix: string) => `${prefix}${randomBytes(6).toString('hex').toUpperCase()}`

export function createFakePayments(): PaymentsProvider & PaymentsSimulator {
  const orders = new Map<string, FakeOrder>()
  const byRequestId = new Map<string, unknown>()
  const refundedCaptures = new Set<string>()
  const payoutBatchIds = new Set<string>()

  const idempotent = <T>(requestId: string, run: () => T): T => {
    if (byRequestId.has(requestId)) return byRequestId.get(requestId) as T
    const result = run()
    byRequestId.set(requestId, result)
    return result
  }

  const getOrder = (id: string): FakeOrder => {
    const order = orders.get(id)
    if (!order) throw new AppError('paypal_error', `Fake PayPal: order ${id} not found`, { status: 404 })
    return order
  }

  const gatewayFor = (tenantId: string): PaymentsGateway => ({
    async createOrder(input) {
      return idempotent(input.requestId, () => {
        const order: FakeOrder = {
          id: fakeId('FAKEORDER'),
          tenantId,
          status: 'CREATED',
          amount: input.total,
          currency: input.currency,
          customId: input.customId,
          payerId: null,
          captureId: null,
        }
        orders.set(order.id, order)
        return { orderId: order.id, status: order.status }
      })
    },
    async getOrder(orderId) {
      const o = getOrder(orderId)
      return { id: o.id, status: o.status, amount: o.amount, currency: o.currency, customId: o.customId, payerId: o.payerId }
    },
    async captureOrder(orderId, requestId) {
      return idempotent(requestId, () => {
        const o = getOrder(orderId)
        if (o.status !== 'APPROVED') throw new AppError('paypal_error', `Fake PayPal: order is ${o.status}`, { status: 422 })
        o.status = 'COMPLETED'
        o.captureId = fakeId('FAKECAPTURE')
        return { captureId: o.captureId, status: 'COMPLETED', payerId: o.payerId }
      })
    },
    async addTracking() {
      return { trackerId: fakeId('FAKETRACKER') }
    },
    async refundCapture(input) {
      return idempotent(input.requestId, () => {
        const known = [...orders.values()].some((o) => o.captureId === input.captureId)
        if (!known) throw new AppError('paypal_error', 'Fake PayPal: capture not found', { status: 404 })
        if (refundedCaptures.has(input.captureId)) throw new AppError('paypal_error', 'Fake PayPal: already refunded', { status: 422 })
        refundedCaptures.add(input.captureId)
        return { refundId: fakeId('FAKEREFUND'), status: 'COMPLETED' }
      })
    },
    async createPayout(input) {
      if (payoutBatchIds.has(input.batchId)) throw new AppError('paypal_error', 'Fake PayPal: duplicate sender_batch_id', { status: 400 })
      payoutBatchIds.add(input.batchId)
      return { payoutBatchId: fakeId('FAKEPAYOUT'), status: 'SUCCESS' }
    },
    async getPayoutStatus() {
      return 'SUCCESS'
    },
    async verifyWebhook() {
      return true
    },
  })

  return {
    mode: 'fake',
    forTenant: (tenant) => gatewayFor(tenant.id),
    publicClientId: () => null,
    async approveOrder(orderId, payerId) {
      const o = getOrder(orderId)
      if (o.status !== 'CREATED') throw new AppError('conflict', `Fake PayPal: order is ${o.status}`)
      o.status = 'APPROVED'
      o.payerId = payerId
    },
    async tamperAmount(orderId, amount) {
      getOrder(orderId).amount = amount
    },
  }
}
