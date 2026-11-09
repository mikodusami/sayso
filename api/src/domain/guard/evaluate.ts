import { compareMoney, subtractMoney } from '../../shared'
import type { Mandate, Product, Quote } from '../model'
import { verifyFingerprint } from '../mandate/fingerprint'
import { matchesAny } from './normalise'
import type { CheckResult, CheckSummary, FuzzyQuestion, FuzzyVerdict } from './types'

export const FUZZY_CONFIDENCE_THRESHOLD = 0.8

export interface CandidateInput {
  mandate: Pick<Mandate, 'body' | 'canonical' | 'fingerprint' | 'status' | 'usesLeft' | 'budgetSpent' | 'expiresAt'>
  product: Product
  quote: Quote
  agentId: string
  now: Date
}

export interface CheckPlan {
  results: CheckResult[]
  /** Fuzzy constraints that need a judgement before the plan is final. */
  pending: FuzzyQuestion[]
}

const code = (name: string, ok: boolean, passReason: string, failReason: string, field?: string): CheckResult => ({
  name,
  result: ok ? 'pass' : 'fail',
  reason: ok ? passReason : failReason,
  source: 'code',
  ...(field ? { field } : {}),
})

/** Hard checks: decided by code only. No prompt can get past these. */
export function hardChecks(input: CandidateInput): CheckResult[] {
  const { mandate, quote, agentId, now, product } = input
  const body = mandate.body
  const remaining = subtractMoney(body.budget.max_total, mandate.budgetSpent)
  const counted = body.budget.includes.length === 1 ? quote.itemTotal : quote.total
  const merchantOk = body.merchants === 'any' || body.merchants.includes(quote.merchantId)

  const results = [
    code('fingerprint', verifyFingerprint(mandate.canonical, mandate.fingerprint), 'Mandate is intact', 'Mandate content does not match its fingerprint'),
    code('status', mandate.status === 'active', 'Mandate is active', `Mandate is ${mandate.status.replace('_', ' ')}`),
    code('expiry', mandate.expiresAt > now, 'Mandate has not expired', 'Mandate has expired'),
    code('uses', mandate.usesLeft > 0, 'Mandate has uses left', 'Mandate has already been used'),
    code('agent', body.agents.includes(agentId), `${agentId} is allowed`, `${agentId} is not allowed by this mandate`),
    code('merchant', merchantOk, 'Merchant is allowed', 'This merchant is not allowed by the mandate'),
    code('currency', quote.currency === body.budget.currency, `Paid in ${quote.currency}`, `Wrong currency (${quote.currency})`),
    code('quantity', quote.quantity === body.item.quantity, `Quantity ${quote.quantity}`, `Quantity ${quote.quantity} but you asked for ${body.item.quantity}`),
    code(
      'total',
      compareMoney(counted, remaining) <= 0,
      `$${counted} is within your $${body.budget.max_total} limit`,
      `$${counted} total is over your $${body.budget.max_total} limit`,
    ),
    code('stock', product.stock >= quote.quantity, 'In stock', 'Out of stock'),
  ]
  if (body.delivery.by) {
    results.push(code('delivery', quote.arrivesBy <= body.delivery.by, `Arrives by ${quote.arrivesBy}`, `Arrives ${quote.arrivesBy}, after ${body.delivery.by}`))
  }
  return results
}

/** Checks every hard rule and constraint. Fuzzy constraints code can't settle come back as pending. */
export function planChecks(input: CandidateInput): CheckPlan {
  const results = hardChecks(input)
  const pending: FuzzyQuestion[] = []

  for (const constraint of input.mandate.body.constraints) {
    const actual = input.product.attributes[constraint.field]
    const wanted = constraint.values.join(' or ')
    if (actual === undefined) {
      results.push({
        name: `match:${constraint.field}`,
        result: constraint.kind === 'exact' ? 'fail' : 'ask',
        reason: `The product does not list a ${constraint.field}`,
        source: 'code',
        field: constraint.field,
      })
      continue
    }
    if (matchesAny(constraint.values, actual)) {
      results.push({ name: `match:${constraint.field}`, result: 'pass', reason: `${constraint.field} ${actual} matches ${wanted}`, source: 'code', field: constraint.field })
    } else if (constraint.kind === 'exact') {
      results.push({ name: `match:${constraint.field}`, result: 'fail', reason: `${constraint.field} ${actual} is not ${wanted}`, source: 'code', field: constraint.field })
    } else {
      pending.push({ field: constraint.field, allowed: constraint.values, productValue: actual })
    }
  }
  return { results, pending }
}

/** Turns an AI verdict into a check. Unsure or low confidence always asks the shopper. */
export function resolveFuzzy(question: FuzzyQuestion, verdict: FuzzyVerdict): CheckResult {
  const base = { name: `match:${question.field}`, source: 'ai' as const, field: question.field, confidence: verdict.confidence }
  const wanted = question.allowed.join(' or ')
  if (verdict.verdict === 'match' && verdict.confidence >= FUZZY_CONFIDENCE_THRESHOLD) {
    return { ...base, result: 'pass', reason: `Agent judged ${question.productValue} as ${wanted}: ${verdict.reason}` }
  }
  if (verdict.verdict === 'no_match' && verdict.confidence >= FUZZY_CONFIDENCE_THRESHOLD) {
    return { ...base, result: 'fail', reason: `${question.field} ${question.productValue} is not ${wanted}` }
  }
  return { ...base, result: 'ask', reason: `Is ${question.productValue} OK for ${question.field} ${wanted}?` }
}

export function summariseChecks(results: CheckResult[]): CheckSummary {
  const failures = results.filter((r) => r.result === 'fail')
  const asks = results.filter((r) => r.result === 'ask')
  const aiJudgedFields = results
    .filter((r) => r.source === 'ai' && r.result === 'pass' && r.field)
    .map((r) => r.field as string)
  const outcome = failures.length ? 'fail' : asks.length ? 'ask' : 'pass'
  return { outcome, failures, asks, aiJudgedFields }
}

/** Convenience for callers that already have verdicts for every pending question. */
export function finaliseChecks(plan: CheckPlan, verdicts: FuzzyVerdict[]): CheckResult[] {
  if (verdicts.length !== plan.pending.length) throw new Error('One verdict is needed per pending question')
  return [...plan.results, ...plan.pending.map((q, i) => resolveFuzzy(q, verdicts[i] as FuzzyVerdict))]
}
