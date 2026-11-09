import { Hono } from 'hono'
import { AppError } from '../../shared'
import type { AppEnv } from '../_kit'
import type { PayPalWebhookService } from './service'

const HEADERS = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time']

export function createPayPalWebhookRoutes(webhooks: PayPalWebhookService) {
  // Public: authenticity is proven by PayPal's signature, checked in the service.
  return new Hono<AppEnv>().post('/v1/paypal/webhooks/:tenantId', async (c) => {
    let event
    try {
      event = await c.req.json()
    } catch {
      throw new AppError('invalid_request', 'Body must be JSON')
    }
    const headers = Object.fromEntries(HEADERS.map((h) => [h, c.req.header(h)]))
    const result = await webhooks.handle(c.req.param('tenantId'), headers, event)
    return c.json(result)
  })
}
