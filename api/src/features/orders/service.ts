import type { Checkout, Shipment, Tenant } from '../../domain'
import type { PaymentsProvider, Repositories } from '../../ports'
import { AppError, newId, notFound, type Clock } from '../../shared'
import type { TimelineService } from '../timeline'

export interface OrderDeps {
  repos: Repositories
  payments: PaymentsProvider
  timeline: TimelineService
  clock: Clock
}

/** The merchant's view of agent orders: what was asked, bought and shipped. */
export function createOrderService({ repos, payments, timeline, clock }: OrderDeps) {
  async function owned(merchantId: string, checkoutId: string): Promise<Checkout> {
    const checkout = await repos.checkouts.get(checkoutId)
    if (!checkout || checkout.merchantId !== merchantId) throw notFound('Order', checkoutId)
    return checkout
  }

  async function merchant(id: string): Promise<Tenant> {
    const tenant = await repos.tenants.get(id)
    if (!tenant) throw notFound('Merchant', id)
    return tenant
  }

  return {
    list: (merchantId: string, limit = 50) => repos.checkouts.listForMerchant(merchantId, limit),

    async detail(merchantId: string, checkoutId: string) {
      const checkout = await owned(merchantId, checkoutId)
      const [mandate, product, shipment, findings, agent, events] = await Promise.all([
        repos.mandates.get(checkout.mandateId),
        repos.products.getBySku(checkout.merchantId, checkout.quote.sku),
        repos.shipments.latestForCheckout(checkout.id),
        repos.findings.listForCheckout(checkout.id),
        repos.agents.get(checkout.agentId),
        timeline.forSubjects([checkout.id, checkout.mandateId]),
      ])
      return { checkout, mandate, product, shipment, findings, agent, events }
    },

    /** Records what actually shipped and adds tracking to the PayPal order. */
    async ship(merchantId: string, checkoutId: string, input: { carrier: string; trackingNumber: string; shippedSku: string }): Promise<Shipment> {
      const checkout = await owned(merchantId, checkoutId)
      if (checkout.status !== 'paid' || !checkout.captureId || !checkout.paypalOrderId) {
        throw new AppError('conflict', 'Only paid orders can be shipped')
      }
      const tenant = await merchant(merchantId)
      const { trackerId } = await payments.forTenant(tenant).addTracking({
        orderId: checkout.paypalOrderId,
        captureId: checkout.captureId,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        items: [{ name: checkout.productTitle, sku: input.shippedSku, quantity: checkout.quote.quantity }],
      })
      const shipment = await repos.shipments.create({
        id: newId('shipment'),
        checkoutId,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        shippedSku: input.shippedSku,
        paypalTrackerId: trackerId,
        status: 'shipped',
        deliveredAt: null,
        createdAt: clock.now(),
      })
      const mismatch = input.shippedSku !== checkout.quote.sku
      await timeline.record({
        tenantIds: [checkout.merchantId, checkout.agentProviderId],
        subjectType: 'checkout',
        subjectId: checkoutId,
        kind: 'order.shipped',
        actor: 'merchant',
        message: `Shipped ${input.shippedSku} via ${input.carrier} ${input.trackingNumber}${mismatch ? ` (ordered ${checkout.quote.sku})` : ''}`,
        paypalRef: trackerId,
      })
      return shipment
    },

    async markDelivered(merchantId: string, checkoutId: string): Promise<Shipment> {
      const checkout = await owned(merchantId, checkoutId)
      const shipment = await repos.shipments.latestForCheckout(checkout.id)
      if (!shipment) throw new AppError('conflict', 'This order has not shipped')
      const delivered = await repos.shipments.update(shipment.id, { status: 'delivered', deliveredAt: clock.now() })
      await timeline.record({
        tenantIds: [checkout.merchantId, checkout.agentProviderId],
        subjectType: 'checkout',
        subjectId: checkoutId,
        kind: 'order.delivered',
        actor: 'carrier',
        message: `Delivered (${shipment.carrier} ${shipment.trackingNumber})`,
      })
      return delivered
    },

  }
}

export type OrderService = ReturnType<typeof createOrderService>
