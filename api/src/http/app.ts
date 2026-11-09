import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from '../features/_kit'
import { onError, notFoundHandler } from './errors'
import { authenticate, type AuthDeps } from './middleware/authenticate'
import { idempotency } from './middleware/idempotency'
import { API_INDEX } from './openapi'

export interface HttpAppOptions {
  auth: AuthDeps
  idempotency: Parameters<typeof idempotency>[0]
  now: () => Date
  webOrigin: string
  /** Feature route groups, mounted in order. */
  routes: Array<Hono<AppEnv>>
  info: Record<string, unknown>
}

export function createHttpApp(options: HttpAppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? randomUUID()
    c.set('requestId', requestId)
    await next()
    c.header('x-request-id', requestId)
  })
  app.use(
    '*',
    cors({
      origin: [options.webOrigin],
      allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Sayso-Link', 'X-Admin-Token'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
      exposeHeaders: ['x-request-id', 'Idempotent-Replayed'],
    }),
  )
  app.use('*', authenticate(options.auth))
  app.use('/v1/*', idempotency(options.idempotency, options.now))

  app.get('/health', (c) => c.json({ ok: true, ...options.info }))
  app.get('/v1', (c) => c.json(API_INDEX))
  for (const routes of options.routes) app.route('/', routes)

  app.onError(onError)
  app.notFound(notFoundHandler)
  return app
}
