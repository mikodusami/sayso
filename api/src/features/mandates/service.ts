import {
  buildMandateBody,
  canonicalJson,
  describeMandate,
  fingerprintOf,
  reviewDraft,
  shortFingerprint,
  type Mandate,
  type MandateDraft,
} from '../../domain'
import type { AiService, Repositories, TokenSigner } from '../../ports'
import { AppError, forbidden, invalid, isoDate, newId, notFound, type Clock } from '../../shared'
import { LINK_TTL_SECONDS, type Links } from '../_kit'
import type { TimelineService } from '../timeline'

export interface MandateDeps {
  repos: Repositories
  ai: AiService
  tokens: TokenSigner
  timeline: TimelineService
  links: Links
  clock: Clock
}

export interface CreateMandateInput {
  agentProviderId: string
  shopperRef: string
  shopperName?: string
  draft: MandateDraft
  agents?: string[]
  merchants?: 'any' | string[]
  uses?: number
}

export function createMandateService({ repos, ai, tokens, timeline, links, clock }: MandateDeps) {
  /** Marks a mandate expired when its time has passed. */
  async function fresh(mandate: Mandate): Promise<Mandate> {
    if ((mandate.status === 'active' || mandate.status === 'pending_approval') && mandate.expiresAt <= clock.now()) {
      return repos.mandates.update(mandate.id, { status: 'expired' })
    }
    return mandate
  }

  async function load(id: string): Promise<Mandate> {
    const mandate = await repos.mandates.get(id)
    if (!mandate) throw notFound('Mandate', id)
    return fresh(mandate)
  }

  function approvalUrl(mandateId: string) {
    return links.approveMandate(mandateId, tokens.sign({ action: 'approve_mandate', subject: mandateId }, LINK_TTL_SECONDS))
  }

  return {
    /** AI turns words into a draft. Missing pieces come back as questions. */
    async parse(text: string) {
      const { draft } = await ai.parseRequest(text, isoDate(clock.now()))
      return { draft, questions: reviewDraft(draft).questions }
    },

    async create(input: CreateMandateInput) {
      const review = reviewDraft(input.draft)
      if (!review.complete) throw invalid('The mandate is missing details', { questions: review.questions })

      const providerAgents = await repos.agents.listForTenant(input.agentProviderId)
      const agents = input.agents ?? providerAgents.map((a) => a.id)
      const unknown = agents.filter((id) => !providerAgents.some((a) => a.id === id))
      if (!agents.length || unknown.length) throw invalid('Agents must be registered to this agent provider', { unknown })

      const shopper = await repos.shoppers.getOrCreate({
        id: newId('shopper'),
        agentProviderId: input.agentProviderId,
        externalRef: input.shopperRef,
        displayName: input.shopperName ?? input.shopperRef,
      })

      const now = clock.now()
      const body = buildMandateBody({
        id: newId('mandate'),
        shopperId: shopper.id,
        agentProviderId: input.agentProviderId,
        draft: input.draft,
        agents,
        merchants: input.merchants,
        uses: input.uses,
        now,
      })
      const canonical = canonicalJson(body)
      const mandate = await repos.mandates.create({
        id: body.id,
        shopperId: shopper.id,
        agentProviderId: input.agentProviderId,
        body,
        canonical,
        fingerprint: fingerprintOf(canonical),
        status: 'pending_approval',
        approval: null,
        usesLeft: body.uses,
        budgetSpent: '0.00',
        expiresAt: new Date(body.expires_at),
        createdAt: now,
      })

      await timeline.record({
        tenantIds: [input.agentProviderId],
        subjectType: 'mandate',
        subjectId: mandate.id,
        kind: 'mandate.created',
        actor: 'agent_provider',
        message: `Mandate ${shortFingerprint(mandate.fingerprint)} created: ${body.item.description}, max $${body.budget.max_total}`,
        data: { fingerprint: mandate.fingerprint },
      })
      return { mandate, approvalUrl: approvalUrl(mandate.id) }
    },

    async getForProvider(id: string, agentProviderId: string) {
      const mandate = await load(id)
      if (mandate.agentProviderId !== agentProviderId) throw notFound('Mandate', id)
      return mandate
    },

    get: load,

    async approve(id: string, details: { userAgent: string | null }) {
      const mandate = await load(id)
      if (mandate.status !== 'pending_approval') throw new AppError('conflict', `Mandate is ${mandate.status.replace('_', ' ')}`)
      const approved = await repos.mandates.update(id, {
        status: 'active',
        approval: { approvedAt: clock.now().toISOString(), fingerprintShown: mandate.fingerprint, method: 'click', userAgent: details.userAgent },
      })
      await timeline.record({
        tenantIds: [mandate.agentProviderId],
        subjectType: 'mandate',
        subjectId: id,
        kind: 'mandate.approved',
        actor: 'shopper',
        message: `Shopper approved mandate ${shortFingerprint(mandate.fingerprint)}`,
        data: { fingerprint: mandate.fingerprint },
        notify: 'mandate.approved',
      })
      return approved
    },

    async revoke(id: string, agentProviderId: string) {
      const mandate = await load(id)
      if (mandate.agentProviderId !== agentProviderId) throw forbidden()
      if (mandate.status !== 'active' && mandate.status !== 'pending_approval') {
        throw new AppError('conflict', `Mandate is already ${mandate.status}`)
      }
      const revoked = await repos.mandates.update(id, { status: 'revoked' })
      await timeline.record({
        tenantIds: [agentProviderId],
        subjectType: 'mandate',
        subjectId: id,
        kind: 'mandate.revoked',
        actor: 'agent_provider',
        message: 'Mandate revoked. No new checkouts can use it.',
      })
      return revoked
    },

    approvalUrl,
  }
}

export type MandateService = ReturnType<typeof createMandateService>

export function presentMandate(m: Mandate) {
  return {
    id: m.id,
    status: m.status,
    fingerprint: m.fingerprint,
    fingerprint_short: shortFingerprint(m.fingerprint),
    shopper_id: m.shopperId,
    card: describeMandate(m.body),
    original_text: m.body.original_text,
    body: m.body,
    uses_left: m.usesLeft,
    budget_spent: m.budgetSpent,
    expires_at: m.expiresAt.toISOString(),
    approval: m.approval,
    created_at: m.createdAt.toISOString(),
  }
}
