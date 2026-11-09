import { z } from 'zod'

const MoneyString = z.string().regex(/^\d+\.\d{2}$/, 'Use a two-decimal amount like "120.00"')

export const Constraint = z.object({
  field: z.string().min(1), // "size", "colour"
  kind: z.enum(['exact', 'fuzzy']), // exact: code decides; fuzzy: AI may judge
  op: z.enum(['eq', 'one_of']),
  values: z.array(z.string().min(1)).min(1),
})
export type Constraint = z.infer<typeof Constraint>

/** The signed content of a mandate. Everything the fingerprint covers. */
export const MandateBody = z.object({
  v: z.literal('sayso.mandate/1'),
  id: z.string(),
  shopper: z.string(),
  agent_provider: z.string(),
  created_at: z.iso.datetime(),
  expires_at: z.iso.datetime(),
  original_text: z.string(),
  item: z.object({
    description: z.string().min(1),
    category: z.string().min(1),
    quantity: z.number().int().min(1).max(10),
  }),
  constraints: z.array(Constraint).max(6),
  budget: z.object({
    max_total: MoneyString,
    currency: z.literal('USD'),
    includes: z.array(z.enum(['item', 'shipping', 'tax'])).min(1),
  }),
  delivery: z.object({ by: z.iso.date().nullable() }),
  merchants: z.union([z.literal('any'), z.array(z.string()).min(1)]),
  agents: z.array(z.string()).min(1),
  uses: z.number().int().min(1).max(10),
  autonomy: z.literal('approve_each'),
})
export type MandateBody = z.infer<typeof MandateBody>

/**
 * What the shopper (via AI or a form) has said so far. Missing pieces become
 * clarifying questions instead of guesses.
 */
export const MandateDraft = z.object({
  original_text: z.string(),
  item: z.object({
    description: z.string().nullable(),
    category: z.string().nullable(),
    quantity: z.number().int().min(1).max(10).nullable(),
  }),
  constraints: z.array(Constraint).max(6),
  max_total: MoneyString.nullable(),
  budget_includes_shipping: z.boolean().nullable(),
  deliver_by: z.iso.date().nullable(),
})
export type MandateDraft = z.infer<typeof MandateDraft>

export const MANDATE_DEFAULTS = {
  expiresInHours: 72,
  maxExpiryDays: 14,
  uses: 1,
} as const
