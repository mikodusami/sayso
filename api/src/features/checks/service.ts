import {
  planChecks,
  quoteFor,
  resolveFuzzy,
  summariseChecks,
  type CheckResult,
  type CheckSummary,
  type FuzzyQuestion,
  type FuzzyVerdict,
  type Mandate,
  type Product,
  type Quote,
} from '../../domain'
import type { AiService, Repositories } from '../../ports'
import { notFound, type Clock } from '../../shared'

export interface Evaluation {
  quote: Quote
  checks: CheckResult[]
  summary: CheckSummary
}

/**
 * Runs every check for one candidate: code first, then AI only for fuzzy
 * constraints code could not settle. Used by the guard (POST /v1/checks), the
 * merchant verifier (checkouts) and anything else that needs the same answer.
 */
export function createCandidateEvaluator({ ai, clock }: { ai: AiService; clock: Clock }) {
  const cache = new Map<string, FuzzyVerdict>()

  async function judge(q: FuzzyQuestion): Promise<FuzzyVerdict> {
    const key = JSON.stringify([q.field, [...q.allowed].sort(), q.productValue.toLowerCase()])
    const cached = cache.get(key)
    if (cached) return cached
    const verdict = await ai.judgeAttribute(q)
    cache.set(key, verdict)
    return verdict
  }

  return {
    async evaluate(input: { mandate: Mandate; product: Product; quantity: number; agentId: string }): Promise<Evaluation> {
      const now = clock.now()
      const quote = quoteFor(input.product, input.quantity, now)
      const plan = planChecks({ mandate: input.mandate, product: input.product, quote, agentId: input.agentId, now })
      const fuzzy = await Promise.all(plan.pending.map(async (q) => resolveFuzzy(q, await judge(q))))
      const checks = [...plan.results, ...fuzzy]
      return { quote, checks, summary: summariseChecks(checks) }
    },
  }
}

export type CandidateEvaluator = ReturnType<typeof createCandidateEvaluator>

/** The guard as a service: an agent provider asks "would this pass?" before proposing it. */
export function createChecksService({ repos, evaluator }: { repos: Repositories; evaluator: CandidateEvaluator }) {
  return {
    async check(input: { agentProviderId: string; agentId: string; mandateId: string; merchantId: string; sku: string; quantity?: number }) {
      const mandate = await repos.mandates.get(input.mandateId)
      if (!mandate || mandate.agentProviderId !== input.agentProviderId) throw notFound('Mandate', input.mandateId)
      const product = await repos.products.getBySku(input.merchantId, input.sku)
      if (!product) throw notFound('Product', input.sku)
      const evaluation = await evaluator.evaluate({ mandate, product, quantity: input.quantity ?? mandate.body.item.quantity, agentId: input.agentId })
      return { product, ...evaluation }
    },
  }
}

export type ChecksService = ReturnType<typeof createChecksService>

export const presentChecks = (checks: CheckResult[]) =>
  checks.map((c) => ({ name: c.name, result: c.result, reason: c.reason, source: c.source, ...(c.field ? { field: c.field } : {}), ...(c.confidence !== undefined ? { confidence: c.confidence } : {}) }))
