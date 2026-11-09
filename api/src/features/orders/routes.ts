import { Hono } from 'hono'
import { z } from 'zod'
import { describeMandate, type Shipment } from '../../domain'
import { body, query, tenantOf, type AppEnv } from '../_kit'
import { presentCheckout } from '../checkouts'
import { presentEvent } from '../timeline'
import type { OrderService } from './service'

const presentShipment = (s: Shipment | null) =>
  s && {
    id: s.id,
    carrier: s.carrier,
    tracking_number: s.trackingNumber,
    shipped_sku: s.shippedSku,
    paypal_tracker_id: s.paypalTrackerId,
    status: s.status,
    delivered_at: s.deliveredAt?.toISOString() ?? null,
  }

export function createOrderRoutes(orders: OrderService) {
  return new Hono<AppEnv>()
    .get('/v1/orders', query(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) })), async (c) => {
      const merchant = tenantOf(c, 'merchant')
      const list = await orders.list(merchant.id, c.req.valid('query').limit)
      return c.json({ data: list.map((o) => presentCheckout(o)) })
    })
    .get('/v1/orders/:id', async (c) => {
      const merchant = tenantOf(c, 'merchant')
      const d = await orders.detail(merchant.id, c.req.param('id'))
      return c.json({
        ...presentCheckout(d.checkout),
        agent: d.agent && { id: d.agent.id, name: d.agent.name, runs_guard: d.agent.runsGuard },
        // The three columns merchants compare.
        asked: d.mandate && {
          mandate_id: d.mandate.id,
          fingerprint: d.mandate.fingerprint,
          card: describeMandate(d.mandate.body),
          original_text: d.mandate.body.original_text,
        },
        bought: { sku: d.checkout.quote.sku, title: d.checkout.productTitle, attributes: d.product?.attributes ?? {}, total: d.checkout.quote.total },
        shipped: presentShipment(d.shipment),
        findings: d.findings.map((f) => ({ id: f.id, rule: f.decision.rule, fault: f.decision.fault, status: f.status })),
        timeline: d.events.map(presentEvent),
      })
    })
    .post(
      '/v1/orders/:id/shipments',
      body(z.object({ carrier: z.string().min(2).default('USPS'), tracking_number: z.string().min(4), shipped_sku: z.string().min(1) })),
      async (c) => {
        const merchant = tenantOf(c, 'merchant')
        const input = c.req.valid('json')
        const shipment = await orders.ship(merchant.id, c.req.param('id'), {
          carrier: input.carrier,
          trackingNumber: input.tracking_number,
          shippedSku: input.shipped_sku,
        })
        return c.json(presentShipment(shipment), 201)
      },
    )
    .post('/v1/orders/:id/delivered', async (c) => {
      const merchant = tenantOf(c, 'merchant')
      return c.json(presentShipment(await orders.markDelivered(merchant.id, c.req.param('id'))))
    })
}
