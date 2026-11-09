import { Hono } from 'hono'
import { z } from 'zod'
import type { MerchantSettings } from '../../domain'
import { body, tenantOf, type AppEnv } from '../_kit'
import type { SettingsService } from './service'

const present = (s: MerchantSettings) => ({ verifier_mode: s.verifierMode, auto_refund_limit: s.autoRefundLimit, return_policy: s.returnPolicy })

export function createSettingsRoutes(settings: SettingsService) {
  return new Hono<AppEnv>()
    .get('/v1/settings', (c) => c.json(present(tenantOf(c, 'merchant').settings)))
    .patch(
      '/v1/settings',
      body(
        z.object({
          verifier_mode: z.enum(['block', 'flag']).optional(),
          auto_refund_limit: z.string().regex(/^\d+\.\d{2}$/).optional(),
          return_policy: z.string().max(500).optional(),
        }),
      ),
      async (c) => {
        const merchant = tenantOf(c, 'merchant')
        const input = c.req.valid('json')
        const updated = await settings.update(merchant, {
          ...(input.verifier_mode ? { verifierMode: input.verifier_mode } : {}),
          ...(input.auto_refund_limit ? { autoRefundLimit: input.auto_refund_limit } : {}),
          ...(input.return_policy !== undefined ? { returnPolicy: input.return_policy } : {}),
        })
        return c.json(present(updated))
      },
    )
}
