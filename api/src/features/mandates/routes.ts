import { Hono } from 'hono'
import { z } from 'zod'
import { MandateDraft } from '../../domain'
import { body, linkFor, tenantOf, type AppEnv } from '../_kit'
import { presentMandate, type MandateService } from './service'

const CreateBody = z.object({
  shopper_ref: z.string().min(1),
  shopper_name: z.string().optional(),
  draft: MandateDraft,
  agents: z.array(z.string()).min(1).optional(),
  merchants: z.union([z.literal('any'), z.array(z.string()).min(1)]).optional(),
  uses: z.number().int().min(1).max(10).optional(),
})

export function createMandateRoutes(mandates: MandateService) {
  return new Hono<AppEnv>()
    .post('/v1/mandates/parse', body(z.object({ text: z.string().min(3).max(1000) })), async (c) => {
      tenantOf(c, 'agent_provider')
      return c.json(await mandates.parse(c.req.valid('json').text))
    })
    .post('/v1/mandates', body(CreateBody), async (c) => {
      const provider = tenantOf(c, 'agent_provider')
      const input = c.req.valid('json')
      const { mandate, approvalUrl } = await mandates.create({
        agentProviderId: provider.id,
        shopperRef: input.shopper_ref,
        shopperName: input.shopper_name,
        draft: input.draft,
        agents: input.agents,
        merchants: input.merchants,
        uses: input.uses,
      })
      return c.json({ ...presentMandate(mandate), approval_url: approvalUrl }, 201)
    })
    .get('/v1/mandates/:id', async (c) => {
      const provider = tenantOf(c, 'agent_provider')
      return c.json(presentMandate(await mandates.getForProvider(c.req.param('id'), provider.id)))
    })
    .post('/v1/mandates/:id/revoke', async (c) => {
      const provider = tenantOf(c, 'agent_provider')
      return c.json(presentMandate(await mandates.revoke(c.req.param('id'), provider.id)))
    })
    // Hosted approval page (shopper, via signed link).
    .get('/v1/hosted/mandates/:id', async (c) => {
      const id = c.req.param('id')
      linkFor(c, 'approve_mandate', id)
      return c.json(presentMandate(await mandates.get(id)))
    })
    .post('/v1/hosted/mandates/:id/approve', async (c) => {
      const id = c.req.param('id')
      linkFor(c, 'approve_mandate', id)
      const approved = await mandates.approve(id, { userAgent: c.req.header('user-agent') ?? null })
      return c.json(presentMandate(approved))
    })
}
