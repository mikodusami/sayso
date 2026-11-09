import { Hono } from 'hono'
import { z } from 'zod'
import { AppError } from '../../shared'
import { body, linkFor, tenantOf, type AppEnv } from '../_kit'
import type { CheckoutService } from '../checkouts'
import type { SettlementService } from '../settlement'
import { presentEvent, type TimelineService } from '../timeline'
import { presentFinding, type FindingService } from './service'

const Complaint = z.object({ checkout_id: z.string(), text: z.string().min(3).max(2000) })

export function createFindingRoutes(deps: { findings: FindingService; settlement: SettlementService; checkouts: CheckoutService; timeline: TimelineService }) {
  const { findings, settlement, checkouts, timeline } = deps
  return new Hono<AppEnv>()
    // Agent providers forward a shopper's complaint.
    .post('/v1/complaints', body(Complaint), async (c) => {
      const tenant = tenantOf(c)
      const input = c.req.valid('json')
      const checkout = await checkouts.getForTenant(input.checkout_id, tenant.id)
      const finding = await findings.complain({ checkoutId: checkout.id, text: input.text, source: 'api' })
      return c.json(presentFinding(finding), 201)
    })
    // The shopper complains from the hosted page (same link that paid).
    .post('/v1/hosted/checkouts/:id/complaints', body(z.object({ text: z.string().min(3).max(2000) })), async (c) => {
      const id = c.req.param('id')
      linkFor(c, 'pay_checkout', id)
      const finding = await findings.complain({ checkoutId: id, text: c.req.valid('json').text, source: 'hosted' })
      return c.json(presentFinding(finding), 201)
    })
    .get('/v1/findings', async (c) => {
      const tenant = tenantOf(c)
      const list = tenant.type === 'merchant' ? await findings.listForMerchant(tenant.id) : await findings.listForAgentProvider(tenant.id)
      return c.json({ data: list.map(presentFinding) })
    })
    .get('/v1/findings/:id', async (c) => {
      const tenant = tenantOf(c)
      const finding = await findings.getForTenant(c.req.param('id'), tenant.id)
      const events = await timeline.forSubjects([finding.id])
      return c.json({ ...presentFinding(finding), timeline: events.map(presentEvent) })
    })
    .post('/v1/findings/:id/confirm', async (c) => {
      const merchant = tenantOf(c, 'merchant')
      return c.json(presentFinding(await settlement.confirm(c.req.param('id'), merchant.id)))
    })
    .post('/v1/findings/:id/retry', async (c) => {
      const merchant = tenantOf(c, 'merchant')
      return c.json(presentFinding(await settlement.retry(c.req.param('id'), merchant.id)))
    })
    .post('/v1/findings/:id/refresh', async (c) => {
      const tenant = tenantOf(c)
      await findings.getForTenant(c.req.param('id'), tenant.id)
      return c.json(presentFinding(await settlement.refresh(c.req.param('id'))))
    })
    .post('/v1/findings/:id/appeal', body(z.object({ note: z.string().min(3).max(500) })), async (c) => {
      const merchant = tenantOf(c, 'merchant')
      const finding = await findings.appeal(c.req.param('id'), merchant.id, c.req.valid('json').note)
      if (!finding) throw new AppError('internal', 'Appeal failed')
      return c.json(presentFinding(finding))
    })
}
