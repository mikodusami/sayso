export type ErrorType =
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'mandate_violation'
  | 'paypal_error'
  | 'ai_error'
  | 'internal'

const statusFor: Record<ErrorType, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  mandate_violation: 422,
  paypal_error: 502,
  ai_error: 502,
  internal: 500,
}

/** The only error type features should throw on purpose. */
export class AppError extends Error {
  readonly type: ErrorType
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(type: ErrorType, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.status = statusFor[type]
    this.details = details
  }
}

export const notFound = (what: string, id: string) => new AppError('not_found', `${what} ${id} not found`)
export const invalid = (message: string, details?: Record<string, unknown>) =>
  new AppError('invalid_request', message, details)
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError('conflict', message, details)
export const forbidden = (message = 'This key cannot do that') => new AppError('forbidden', message)
