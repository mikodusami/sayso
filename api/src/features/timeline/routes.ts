import { Hono } from 'hono'
import { z } from 'zod'
import { body, query, tenantOf, type AppEnv } from '../_kit'
import { presentEvent, type TimelineService } from './service'

export function createTimelineRoutes(timeline: TimelineService) {
  return new Hono<AppEnv>()
    .get('/v1/events', query(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) })), async (c) => {
      const tenant = tenantOf(c)
      const events = await timeline.forTenant(tenant.id, c.req.valid('query').limit)
      return c.json({ data: events.map(presentEvent) })
    })
    .post('/v1/webhook-endpoints', body(z.object({ url: z.url() })), async (c) => {
      const tenant = tenantOf(c)
      const endpoint = await timeline.addEndpoint(tenant.id, c.req.valid('json').url)
      // The secret is shown once, here.
      return c.json({ id: endpoint.id, url: endpoint.url, secret: endpoint.secret }, 201)
    })
}
