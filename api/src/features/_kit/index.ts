// Small helpers every feature's routes use. Not a feature itself.
// Authentication (reading keys and tokens) happens in the http layer, which
// puts a Principal on the context. Features decide what that principal may do.
import { zValidator } from '@hono/zod-validator'
import type { Context } from 'hono'
import type { z } from 'zod'
import type { Tenant, TenantType } from '../../domain'
import type { LinkAction, LinkClaims } from '../../ports'
import { AppError } from '../../shared'

export type Principal =
  | { kind: 'tenant'; tenant: Tenant; via: 'api_key' | 'demo_session' }
  | { kind: 'link'; claims: LinkClaims }
  | { kind: 'anonymous' }

export interface AppEnv {
  Variables: {
    principal: Principal
    requestId: string
  }
}

export type AppContext = Context<AppEnv>

/** The calling tenant, optionally of one type. Throws 401/403 otherwise. */
export function tenantOf(c: AppContext, type?: TenantType): Tenant {
  const principal = c.get('principal')
  if (principal.kind !== 'tenant') throw new AppError('unauthorized', 'Send an API key: Authorization: Bearer sk_test_...')
  if (type && principal.tenant.type !== type) {
    throw new AppError('forbidden', `This endpoint is for ${type.replace('_', ' ')} keys`)
  }
  return principal.tenant
}

/** A hosted-page link token for this exact resource and action. */
export function linkFor(c: AppContext, action: LinkAction, subject: string): LinkClaims {
  const principal = c.get('principal')
  if (principal.kind !== 'link' || principal.claims.action !== action || principal.claims.subject !== subject) {
    throw new AppError('unauthorized', 'This link is invalid or has expired')
  }
  return principal.claims
}

/** JSON body validation that fails with Sayso's error shape. */
export function body<S extends z.ZodType>(schema: S) {
  return zValidator('json', schema, (result) => {
    if (!result.success) {
      throw new AppError('invalid_request', 'Request body is invalid', {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }
  })
}

export function query<S extends z.ZodType>(schema: S) {
  return zValidator('query', schema, (result) => {
    if (!result.success) {
      throw new AppError('invalid_request', 'Query is invalid', {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }
  })
}

/** Hosted page links live on the web app. */
export interface Links {
  approveMandate(mandateId: string, token: string): string
  payCheckout(checkoutId: string, token: string): string
}

export function createLinks(webOrigin: string): Links {
  return {
    approveMandate: (id, token) => `${webOrigin}/approve/${id}?t=${encodeURIComponent(token)}`,
    payCheckout: (id, token) => `${webOrigin}/pay/${id}?t=${encodeURIComponent(token)}`,
  }
}

export const LINK_TTL_SECONDS = 30 * 60
