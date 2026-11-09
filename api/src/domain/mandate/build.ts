import { addDays, compareMoney } from '../../shared'
import { MANDATE_DEFAULTS, MandateBody, type MandateDraft } from './schema'

export interface DraftReview {
  complete: boolean
  questions: string[]
}

/** Which questions must the shopper answer before this draft can become a mandate? */
export function reviewDraft(draft: MandateDraft): DraftReview {
  const questions: string[] = []
  if (!draft.item.description) questions.push('What should the agent buy?')
  if (!draft.max_total) questions.push('What is the most you want to spend?')
  else if (compareMoney(draft.max_total, '0.00') <= 0) questions.push('Your limit must be more than $0.00. What is it?')
  if (draft.max_total && draft.budget_includes_shipping === null) {
    questions.push(`Is $${draft.max_total} your limit including shipping and tax?`)
  }
  return { complete: questions.length === 0, questions }
}

export interface BuildMandateInput {
  id: string
  shopperId: string
  agentProviderId: string
  draft: MandateDraft
  agents: string[]
  merchants?: 'any' | string[]
  uses?: number
  expiresAt?: Date
  now: Date
}

/** Turns a complete draft into the exact body that gets fingerprinted. */
export function buildMandateBody(input: BuildMandateInput): MandateBody {
  const { draft, now } = input
  const review = reviewDraft(draft)
  if (!review.complete) {
    throw new Error(`Draft is incomplete: ${review.questions.join(' ')}`)
  }

  const latest = addDays(now, MANDATE_DEFAULTS.maxExpiryDays)
  const fallback = new Date(now.getTime() + MANDATE_DEFAULTS.expiresInHours * 3_600_000)
  const expiresAt = input.expiresAt && input.expiresAt < latest ? input.expiresAt : fallback

  const includes: Array<'item' | 'shipping' | 'tax'> = draft.budget_includes_shipping === false
    ? ['item']
    : ['item', 'shipping', 'tax']

  return MandateBody.parse({
    v: 'sayso.mandate/1',
    id: input.id,
    shopper: input.shopperId,
    agent_provider: input.agentProviderId,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    original_text: draft.original_text,
    item: {
      description: draft.item.description,
      category: draft.item.category ?? 'general',
      quantity: draft.item.quantity ?? 1,
    },
    constraints: draft.constraints,
    budget: { max_total: draft.max_total, currency: 'USD', includes },
    delivery: { by: draft.deliver_by },
    merchants: input.merchants ?? 'any',
    agents: input.agents,
    uses: input.uses ?? MANDATE_DEFAULTS.uses,
    autonomy: 'approve_each',
  })
}

/** The plain-language card the shopper signs. */
export function describeMandate(body: MandateBody): Array<{ label: string; value: string }> {
  const lines = [
    { label: 'item', value: `${body.item.description} × ${body.item.quantity}` },
  ]
  if (body.constraints.length) {
    lines.push({
      label: 'must match',
      value: body.constraints
        .map((c) => (c.op === 'eq' ? `${c.field} ${c.values[0]}` : `${c.field} ${c.values.join(' or ')}`))
        .join(' · '),
    })
  }
  const includes = body.budget.includes.length === 3 ? 'including shipping and tax' : 'item price only'
  lines.push({ label: 'max total', value: `$${body.budget.max_total} ${body.budget.currency} ${includes}` })
  if (body.delivery.by) lines.push({ label: 'deliver by', value: body.delivery.by })
  lines.push({ label: 'merchants', value: body.merchants === 'any' ? 'any Sayso merchant' : body.merchants.join(', ') })
  lines.push({ label: 'agents', value: body.agents.join(', ') })
  lines.push({ label: 'use', value: body.uses === 1 ? 'one order' : `${body.uses} orders` })
  lines.push({ label: 'expires', value: body.expires_at })
  return lines
}
