import { Hono } from 'hono'
import { z } from 'zod'
import { body, linkFor, tenantOf, type AppEnv } from '../_kit'
import { presentEvent, type TimelineService } from '../timeline'
import { presentCheckout, type CheckoutService } from './service'

const CreateBody = z.object({
  mandate_id: z.string(),
  agent_id: z.string(),
  merchant_id: z.string(),
  sku: z.string(),
  quantity: z.number().int().min(1).max(10).optional(),
})

export function createCheckoutRoutes({ checkouts, timeline }: { checkouts: CheckoutService; timeline: TimelineService }) {
  return new Hono<AppEnv>()
    .post('/v1/checkouts', body(CreateBody), async (c) => {
      const provider = tenantOf(c, 'agent_provider')
      const input = c.req.valid('json')
      const { checkout, payUrl } = await checkouts.create({
        agentProviderId: provider.id,
        agentId: input.agent_id,
        mandateId: input.mandate_id,
        merchantId: input.merchant_id,
        sku: input.sku,
        quantity: input.quantity,
      })
      return c.json(presentCheckout(checkout, { payUrl }), 201)
    })
    .get('/v1/checkouts/:id', async (c) => {
      const tenant = tenantOf(c)
      const checkout = await checkouts.getForTenant(c.req.param('id'), tenant.id)
      const events = await timeline.forSubjects([checkout.id, checkout.mandateId])
      return c.json({ ...presentCheckout(checkout), timeline: events.map(presentEvent) })
    })
    // Hosted pay page (shopper, via signed link).
    .get('/v1/hosted/checkouts/:id', async (c) => {
      const id = c.req.param('id')
      linkFor(c, 'pay_checkout', id)
      const view = await checkouts.hostedView(id)
      return c.json({
        ...presentCheckout(view.checkout),
        mandate_card: view.mandateCard,
        fingerprint: view.fingerprint,
        merchant_name: view.merchantName,
        agent_name: view.agentName,
        needs_acceptance: view.needsAcceptance,
        payments: view.payments,
      })
    })
    .post('/v1/hosted/checkouts/:id/accept', async (c) => {
      const id = c.req.param('id')
      linkFor(c, 'pay_checkout', id)
      return c.json(presentCheckout(await checkouts.accept(id)))
    })
    .post('/v1/hosted/checkouts/:id/paypal-order', async (c) => {
      const id = c.req.param('id')
      linkFor(c, 'pay_checkout', id)
      const { orderId } = await checkouts.createPayPalOrder(id)
      return c.json({ order_id: orderId })
    })
    .post('/v1/hosted/checkouts/:id/capture', async (c) => {
      const id = c.req.param('id')
      linkFor(c, 'pay_checkout', id)
      return c.json(presentCheckout(await checkouts.capture(id)))
    })
}
