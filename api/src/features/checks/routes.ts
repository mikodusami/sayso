import { Hono } from 'hono'
import { z } from 'zod'
import { body, tenantOf, type AppEnv } from '../_kit'
import { presentChecks, type ChecksService } from './service'

const CheckBody = z.object({
  mandate_id: z.string(),
  agent_id: z.string(),
  merchant_id: z.string(),
  sku: z.string(),
  quantity: z.number().int().min(1).max(10).optional(),
})

export function createChecksRoutes(checks: ChecksService) {
  return new Hono<AppEnv>().post('/v1/checks', body(CheckBody), async (c) => {
    const provider = tenantOf(c, 'agent_provider')
    const input = c.req.valid('json')
    const result = await checks.check({
      agentProviderId: provider.id,
      agentId: input.agent_id,
      mandateId: input.mandate_id,
      merchantId: input.merchant_id,
      sku: input.sku,
      quantity: input.quantity,
    })
    return c.json({
      outcome: result.summary.outcome,
      sku: result.product.sku,
      title: result.product.title,
      quote: result.quote,
      checks: presentChecks(result.checks),
      ai_judged_fields: result.summary.aiJudgedFields,
    })
  })
}
