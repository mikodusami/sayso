import type { ErrorHandler, NotFoundHandler } from 'hono'
import type { AppEnv } from '../features/_kit'
import { AppError } from '../shared'

/** Every error leaves the API in one shape: { error: { type, message, ...details } }. */
export const onError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof AppError) {
    return c.json({ error: { type: error.type, message: error.message, ...(error.details ?? {}) } }, error.status as 400)
  }
  console.error(`[${c.get('requestId') ?? '-'}]`, error)
  return c.json({ error: { type: 'internal', message: 'Something went wrong', request_id: c.get('requestId') ?? null } }, 500)
}

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  c.json({ error: { type: 'not_found', message: `No route for ${c.req.method} ${c.req.path}` } }, 404)
