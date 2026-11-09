import type { MiddlewareHandler } from 'hono'
import type { AppEnv, Principal } from '../../features/_kit'
import type { KeyHasher, Repositories, TokenSigner } from '../../ports'
import { AppError } from '../../shared'

export interface AuthDeps {
  repos: Pick<Repositories, 'apiKeys' | 'tenants'>
  hasher: KeyHasher
  tokens: TokenSigner
}

/**
 * Works out who is calling and puts a Principal on the context. It never
 * rejects a request on its own: features decide what each principal may do.
 *
 *   Authorization: Bearer sk_test_...   tenant API key (servers)
 *   Authorization: Demo <token>         demo session (web console)
 *   ?t=<token> or X-Sayso-Link          hosted page link (shopper)
 */
export function authenticate({ repos, hasher, tokens }: AuthDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let principal: Principal = { kind: 'anonymous' }
    const header = c.req.header('authorization') ?? ''

    if (header.startsWith('Bearer sk_')) {
      const key = await repos.apiKeys.findByHash(hasher.hash(header.slice('Bearer '.length).trim()))
      if (!key || key.revokedAt) throw new AppError('unauthorized', 'Unknown or revoked API key')
      const tenant = await repos.tenants.get(key.tenantId)
      if (!tenant) throw new AppError('unauthorized', 'Unknown or revoked API key')
      principal = { kind: 'tenant', tenant, via: 'api_key' }
    } else if (header.startsWith('Demo ')) {
      const claims = tokens.verify(header.slice('Demo '.length).trim())
      if (!claims || claims.action !== 'demo_session') throw new AppError('unauthorized', 'Demo session expired. Start a new one.')
      const tenant = await repos.tenants.get(claims.subject)
      if (!tenant) throw new AppError('unauthorized', 'Demo tenant not found. Reset the demo.')
      principal = { kind: 'tenant', tenant, via: 'demo_session' }
    } else {
      const link = c.req.query('t') ?? c.req.header('x-sayso-link')
      if (link) {
        const claims = tokens.verify(link)
        if (claims && claims.action !== 'demo_session') principal = { kind: 'link', claims }
      }
    }

    c.set('principal', principal)
    await next()
  }
}
