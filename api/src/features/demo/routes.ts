import { Hono } from 'hono'
import { z } from 'zod'
import { MandateDraft } from '../../domain'
import { AppError } from '../../shared'
import { body, type AppEnv } from '../_kit'
import { presentCheckout } from '../checkouts'
import type { DemoService } from './service'

const ChatBody = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(['user', 'agent']), text: z.string() })).max(40).default([]),
  state: z.object({ mandateId: z.string().nullable(), draft: MandateDraft.nullable() }).default({ mandateId: null, draft: null }),
})

/**
 * Demo-only routes for the web console and the video. They act as the demo
 * tenants without exposing their API keys. Everything here runs in the
 * PayPal sandbox or the fake PayPal - no real money.
 */
export function createDemoRoutes(demo: DemoService, options: { adminToken: string }) {
  return new Hono<AppEnv>()
    .post('/demo/reset', async (c) => {
      if (c.req.header('x-admin-token') !== options.adminToken) throw new AppError('unauthorized', 'x-admin-token is required')
      await demo.reset()
      return c.json({ ok: true })
    })
    .get('/demo/state', async (c) => c.json(await demo.state()))
    .post('/demo/session', body(z.object({ role: z.enum(['merchant', 'agent_provider']) })), (c) => {
      const session = demo.session(c.req.valid('json').role)
      return c.json({ token: session.token, tenant_id: session.tenantId, header: `Authorization: Demo ${session.token}` })
    })
    .post('/demo/agent/chat', body(ChatBody), async (c) => c.json(await demo.chat(c.req.valid('json'))))
    .post('/demo/careless-buy', body(z.object({ mandate_id: z.string(), sku: z.string() })), async (c) => {
      const input = c.req.valid('json')
      const { checkout, payUrl } = await demo.carelessBuy({ mandateId: input.mandate_id, sku: input.sku })
      return c.json(presentCheckout(checkout, { payUrl }), 201)
    })
    .post('/demo/fake-paypal/orders/:orderId/approve', body(z.object({ payer: z.enum(['maya', 'other']).default('maya') })), async (c) => {
      await demo.fakeApprove(c.req.param('orderId'), c.req.valid('json').payer)
      return c.json({ ok: true })
    })
}
