import { createHash } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../../features/_kit'
import type { Repositories } from '../../ports'
import { AppError } from '../../shared'

/**
 * POSTs with an Idempotency-Key header run once per (tenant, key). A retry
 * with the same body gets the stored response; a different body is a 409.
 * Responses with 5xx status are not stored, so they can be retried.
 */
export function idempotency(repos: Pick<Repositories, 'idempotency'>, now: () => Date): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header('idempotency-key')
    const principal = c.get('principal')
    if (c.req.method !== 'POST' || !key || principal.kind !== 'tenant') return next()

    const raw = await c.req.text()
    const requestHash = createHash('sha256').update(`${c.req.method} ${c.req.path}\n${raw}`).digest('hex')
    const tenantId = principal.tenant.id
    const stored = await repos.idempotency.get(tenantId, key)
    if (stored) {
      if (stored.requestHash !== requestHash) throw new AppError('conflict', 'Idempotency-Key was already used with a different request')
      return c.json(stored.body as object, stored.status as 200, { 'Idempotent-Replayed': 'true' })
    }

    await next()

    if (c.res.status < 500 && c.res.headers.get('content-type')?.includes('application/json')) {
      const body = await c.res.clone().json()
      await repos.idempotency.put({ tenantId, key, requestHash, status: c.res.status, body, createdAt: now() })
    }
  }
}
