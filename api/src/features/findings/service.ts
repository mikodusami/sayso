import {
  canAppeal,
  complaintTypeForDisputeReason,
  decideFault,
  explainDecision,
  initialStatus,
  movesMoney,
  needsMerchantConfirmation,
  type Checkout,
  type ComplaintClassification,
  type FaultFacts,
  type Finding,
  type Mandate,
} from '../../domain'
import type { AiService, Repositories } from '../../ports'
import { AppError, isoDate, newId, notFound, type Clock } from '../../shared'
import type { SettlementService } from '../settlement'
import type { TimelineService } from '../timeline'

export interface FindingDeps {
  repos: Repositories
  ai: AiService
  settlement: SettlementService
  timeline: TimelineService
  clock: Clock
}

export interface ComplaintInput {
  checkoutId: string
  text: string
  source: 'api' | 'hosted' | 'paypal_dispute'
  /** PayPal disputes arrive already classified by reason; others are sorted by AI. */
  classification?: ComplaintClassification
  paypalDisputeId?: string
}

const describeConstraint = (mandate: Mandate, field: string) => {
  const c = mandate.body.constraints.find((x) => x.field === field)
  return c ? `${field} ${c.values.join(' or ')}` : undefined
}

export function createFindingService({ repos, ai, settlement, timeline, clock }: FindingDeps) {
  async function context(checkout: Checkout) {
    const [mandate, product, shipment, shopper, merchant, agent] = await Promise.all([
      repos.mandates.get(checkout.mandateId),
      repos.products.getBySku(checkout.merchantId, checkout.quote.sku),
      repos.shipments.latestForCheckout(checkout.id),
      repos.shoppers.get(checkout.shopperId),
      repos.tenants.get(checkout.merchantId),
      repos.agents.get(checkout.agentId),
    ])
    if (!mandate || !merchant) throw new AppError('internal', `Records missing for ${checkout.id}`)
    return { mandate, product, shipment, shopper, merchant, agent }
  }

  return {
    /** A complaint becomes a finding: facts -> fixed rules -> explanation -> (maybe) settlement. */
    async complain(input: ComplaintInput): Promise<Finding> {
      const checkout = await repos.checkouts.get(input.checkoutId)
      if (!checkout) throw notFound('Checkout', input.checkoutId)
      if (checkout.status !== 'paid') throw new AppError('conflict', 'Only paid orders can have complaints')
      const ctx = await context(checkout)

      const classification =
        input.classification ??
        (await ai.classifyComplaint({
          text: input.text,
          item: ctx.mandate.body.item.description,
          constraints: ctx.mandate.body.constraints.map((c) => ({ field: c.field, values: c.values })),
          attributes: ctx.product?.attributes ?? {},
        }))
      // Only fields the mandate actually constrains can be contested.
      const known = new Set(ctx.mandate.body.constraints.map((c) => c.field))
      const contestedFields = classification.contestedFields.filter((f) => known.has(f))

      const complaint = await repos.complaints.create({
        id: newId('complaint'),
        checkoutId: checkout.id,
        source: input.source,
        text: input.text,
        paypalDisputeId: input.paypalDisputeId ?? null,
        classification: { ...classification, contestedFields },
        createdAt: clock.now(),
      })

      const facts: FaultFacts = {
        type: classification.type,
        contestedFields,
        payerMatches: !checkout.payerId || !ctx.shopper?.paypalPayerId || checkout.payerId === ctx.shopper.paypalPayerId,
        orderedSku: checkout.quote.sku,
        shippedSku: ctx.shipment?.shippedSku ?? null,
        delivered: ctx.shipment?.status === 'delivered',
        deliverBy: ctx.mandate.body.delivery.by,
        today: isoDate(clock.now()),
        flagged: checkout.flagged,
        override: checkout.override !== null,
        aiJudgedFields: checkout.aiJudgedFields,
      }
      const decision = decideFault(facts)

      const field = contestedFields[0]
      const explanation = explainDecision(decision, facts, {
        agentName: ctx.agent?.name ?? checkout.agentId,
        merchantName: ctx.merchant.name,
        amount: checkout.quote.total,
        asked: field ? describeConstraint(ctx.mandate, field) : undefined,
        bought: field && ctx.product?.attributes[field] ? `${field} ${ctx.product.attributes[field]}` : checkout.productTitle,
        deliverBy: ctx.mandate.body.delivery.by,
        returnPolicy: ctx.merchant.settings.returnPolicy,
      })

      let finding = await repos.findings.create({
        id: newId('finding'),
        complaintId: complaint.id,
        checkoutId: checkout.id,
        merchantId: checkout.merchantId,
        agentProviderId: checkout.agentProviderId,
        decision,
        facts: { ...facts, classification_summary: classification.summary },
        explanation,
        amount: checkout.quote.total,
        status: initialStatus(decision),
        refundId: null,
        payoutBatchId: null,
        failureReason: null,
        createdAt: clock.now(),
      })
      await timeline.record({
        tenantIds: [checkout.merchantId, checkout.agentProviderId],
        subjectType: 'finding',
        subjectId: finding.id,
        kind: 'finding.created',
        actor: 'fault_rules',
        message: `Rule ${decision.rule}: ${decision.fault === 'none' ? 'nobody' : decision.fault.replace('_', ' ')} at fault. ${explanation}`,
        notify: 'finding.created',
        data: { checkout_id: checkout.id, complaint: input.text, rule: decision.rule, fault: decision.fault },
      })

      // Small refunds under the merchant's limit settle without a click.
      if (movesMoney(decision) && !needsMerchantConfirmation(finding.amount, ctx.merchant.settings.autoRefundLimit)) {
        finding = await settlement.confirm(finding.id, finding.merchantId, 'auto')
      }
      return finding
    },

    /** A PayPal dispute arrived by webhook. Its reason maps straight to a complaint type. */
    async fromDispute(input: { captureId: string; disputeId: string; reason: string; message: string }) {
      if (await repos.complaints.findByDisputeId(input.disputeId)) return null
      const checkout = await repos.checkouts.findByCaptureId(input.captureId)
      if (!checkout) return null
      return this.complain({
        checkoutId: checkout.id,
        text: input.message || `PayPal dispute: ${input.reason}`,
        source: 'paypal_dispute',
        paypalDisputeId: input.disputeId,
        classification: { type: complaintTypeForDisputeReason(input.reason), contestedFields: [], summary: `PayPal dispute (${input.reason})` },
      })
    },

    async appeal(findingId: string, merchantId: string, note: string) {
      const finding = await repos.findings.get(findingId)
      if (!finding || finding.merchantId !== merchantId) throw notFound('Finding', findingId)
      if (!canAppeal(finding.status)) throw new AppError('conflict', `Finding is ${finding.status}`)
      const appealed = await repos.findings.update(findingId, { status: 'appealed' })
      await timeline.record({
        tenantIds: [finding.merchantId, finding.agentProviderId],
        subjectType: 'finding',
        subjectId: findingId,
        kind: 'finding.appealed',
        actor: 'merchant',
        message: `Merchant disputes this finding: ${note}. No money will move.`,
      })
      return appealed
    },

    async getForTenant(id: string, tenantId: string) {
      const finding = await repos.findings.get(id)
      if (!finding || (finding.merchantId !== tenantId && finding.agentProviderId !== tenantId)) throw notFound('Finding', id)
      return finding
    },

    listForMerchant: (merchantId: string, limit = 50) => repos.findings.listForMerchant(merchantId, limit),
    listForAgentProvider: (agentProviderId: string, limit = 50) => repos.findings.listForAgentProvider(agentProviderId, limit),
  }
}

export type FindingService = ReturnType<typeof createFindingService>

export function presentFinding(f: Finding) {
  return {
    id: f.id,
    checkout_id: f.checkoutId,
    complaint_id: f.complaintId,
    rule: f.decision.rule,
    fault: f.decision.fault,
    action: f.decision.action,
    explanation: f.explanation,
    amount: f.amount,
    status: f.status,
    facts: f.facts,
    refund_id: f.refundId,
    payout_batch_id: f.payoutBatchId,
    failure_reason: f.failureReason,
    created_at: f.createdAt.toISOString(),
  }
}
