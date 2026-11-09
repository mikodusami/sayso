import { describeMandate, shortFingerprint, verifyBeforeCapture, type Checkout, type Mandate, type Tenant } from '../../domain'
import type { PaymentsProvider, Repositories, TokenSigner } from '../../ports'
import { AppError, addMoney, fromCents, newId, notFound, subtractMoney, toCents, type Clock } from '../../shared'
import { LINK_TTL_SECONDS, type Links } from '../_kit'
import { presentChecks, type CandidateEvaluator } from '../checks'
import type { TimelineService } from '../timeline'

export interface CheckoutDeps {
  repos: Repositories
  payments: PaymentsProvider
  evaluator: CandidateEvaluator
  timeline: TimelineService
  tokens: TokenSigner
  links: Links
  clock: Clock
}

export function createCheckoutService(deps: CheckoutDeps) {
  const { repos, payments, evaluator, timeline, tokens, links, clock } = deps

  async function tenant(id: string): Promise<Tenant> {
    const t = await repos.tenants.get(id)
    if (!t) throw notFound('Tenant', id)
    return t
  }

  async function load(id: string): Promise<Checkout> {
    const checkout = await repos.checkouts.get(id)
    if (!checkout) throw notFound('Checkout', id)
    return checkout
  }

  async function mandateOf(checkout: Checkout): Promise<Mandate> {
    const mandate = await repos.mandates.get(checkout.mandateId)
    if (!mandate) throw notFound('Mandate', checkout.mandateId)
    return mandate
  }

  const payUrl = (checkoutId: string) =>
    links.payCheckout(checkoutId, tokens.sign({ action: 'pay_checkout', subject: checkoutId }, LINK_TTL_SECONDS))

  /** A flagged checkout (outside the mandate) can only be paid after the shopper accepts the warning. */
  const needsAcceptance = (c: Checkout) => c.status === 'needs_shopper' || (c.flagged && !c.override)

  const record = (c: Checkout, kind: string, message: string, extra: { paypalRef?: string | null; notify?: string; actor?: string; data?: Record<string, unknown> } = {}) =>
    timeline.record({
      tenantIds: [c.merchantId, c.agentProviderId],
      subjectType: 'checkout',
      subjectId: c.id,
      kind,
      actor: extra.actor ?? 'sayso',
      message,
      paypalRef: extra.paypalRef ?? null,
      data: extra.data,
      notify: extra.notify,
    })

  return {
    /**
     * The merchant verifier. Every agent checkout is checked against the
     * mandate, whatever the agent claims. Block mode refuses violations; flag
     * mode lets them through with the liability recorded against the agent.
     */
    async create(input: { agentProviderId: string; agentId: string; mandateId: string; merchantId: string; sku: string; quantity?: number }) {
      const mandate = await repos.mandates.get(input.mandateId)
      if (!mandate || mandate.agentProviderId !== input.agentProviderId) throw notFound('Mandate', input.mandateId)
      const agent = await repos.agents.get(input.agentId)
      if (!agent || agent.tenantId !== input.agentProviderId) throw new AppError('forbidden', `Agent ${input.agentId} is not registered to this agent provider`)
      const merchant = await tenant(input.merchantId)
      if (merchant.type !== 'merchant') throw notFound('Merchant', input.merchantId)
      const product = await repos.products.getBySku(merchant.id, input.sku)
      if (!product) throw notFound('Product', input.sku)

      const evaluation = await evaluator.evaluate({ mandate, product, quantity: input.quantity ?? mandate.body.item.quantity, agentId: agent.id })
      const { outcome, aiJudgedFields } = evaluation.summary
      const blocked = outcome === 'fail' && merchant.settings.verifierMode === 'block'
      const flagged = outcome === 'fail' && merchant.settings.verifierMode === 'flag'

      const checkout = await repos.checkouts.create({
        id: newId('checkout'),
        mandateId: mandate.id,
        merchantId: merchant.id,
        agentId: agent.id,
        agentProviderId: input.agentProviderId,
        shopperId: mandate.shopperId,
        productTitle: product.title,
        quote: evaluation.quote,
        checks: evaluation.checks,
        aiJudgedFields,
        flagged,
        override: null,
        status: blocked ? 'blocked' : outcome === 'pass' ? 'ready_for_payment' : flagged ? 'ready_for_payment' : 'needs_shopper',
        paypalOrderId: null,
        captureId: null,
        payerId: null,
        failureReason: null,
        createdAt: clock.now(),
      })

      const failures = evaluation.summary.failures.map((f) => f.reason)
      if (blocked) {
        await record(checkout, 'checkout.blocked', `Blocked by ${merchant.name}: ${failures.join('; ')}`, { actor: 'merchant_verifier', notify: 'checkout.blocked', data: { agent: agent.name } })
        throw new AppError('mandate_violation', 'This checkout breaks the mandate and the merchant blocks such orders', {
          checkout_id: checkout.id,
          checks: presentChecks(evaluation.checks),
        })
      }
      if (flagged) {
        await record(checkout, 'checkout.flagged', `Flagged against ${agent.name}: ${failures.join('; ')}`, { actor: 'merchant_verifier', notify: 'checkout.flagged', data: { agent: agent.name } })
      } else {
        await record(checkout, 'checkout.created', `${agent.name} proposed ${product.title} for $${evaluation.quote.total} - ${outcome === 'pass' ? 'matches the mandate' : 'needs the shopper to confirm a detail'}`, { actor: agent.name })
      }
      return { checkout, payUrl: payUrl(checkout.id) }
    },

    get: load,

    async getForTenant(id: string, tenantId: string) {
      const checkout = await load(id)
      if (checkout.merchantId !== tenantId && checkout.agentProviderId !== tenantId) throw notFound('Checkout', id)
      return checkout
    },

    /** Everything the hosted pay page shows. */
    async hostedView(id: string) {
      const checkout = await load(id)
      const mandate = await mandateOf(checkout)
      const merchant = await tenant(checkout.merchantId)
      const agent = await repos.agents.get(checkout.agentId)
      return {
        checkout,
        mandateCard: describeMandate(mandate.body),
        fingerprint: mandate.fingerprint,
        merchantName: merchant.name,
        agentName: agent?.name ?? checkout.agentId,
        needsAcceptance: needsAcceptance(checkout),
        payments: { mode: payments.mode, clientId: payments.publicClientId(merchant) },
      }
    },

    /** The shopper accepts the warnings shown on the pay page. Recorded for the fault rules (R5). */
    async accept(id: string) {
      const checkout = await load(id)
      if (!needsAcceptance(checkout)) throw new AppError('conflict', 'There is nothing to accept on this checkout')
      const warnings = checkout.checks.filter((c) => c.result !== 'pass').map((c) => c.reason)
      const updated = await repos.checkouts.update(id, {
        override: { acceptedAt: clock.now().toISOString(), warnings },
        status: 'ready_for_payment',
      })
      await record(updated, 'checkout.accepted', `Shopper accepted: ${warnings.join('; ')}`, { actor: 'shopper' })
      return updated
    },

    /** Creates (or returns) the PayPal order for the shopper's PayPal button. */
    async createPayPalOrder(id: string) {
      const checkout = await load(id)
      if (checkout.status !== 'ready_for_payment') throw new AppError('conflict', `Checkout is ${checkout.status.replace('_', ' ')}`)
      if (needsAcceptance(checkout)) throw new AppError('conflict', 'Accept the warnings before paying')
      if (checkout.paypalOrderId) return { orderId: checkout.paypalOrderId }

      const mandate = await mandateOf(checkout)
      const merchant = await tenant(checkout.merchantId)
      const agent = await repos.agents.get(checkout.agentId)
      const q = checkout.quote
      const { orderId } = await payments.forTenant(merchant).createOrder({
        requestId: `create-${checkout.id}`,
        referenceId: checkout.id,
        customId: mandate.fingerprint,
        invoiceId: `SAYSO-${checkout.id}`,
        description: `${checkout.productTitle} (agent: ${agent?.name ?? checkout.agentId})`,
        currency: q.currency,
        itemTotal: q.itemTotal,
        shipping: q.shipping,
        taxTotal: q.tax,
        total: q.total,
        items: [{ name: checkout.productTitle, sku: q.sku, quantity: q.quantity, unitAmount: q.unitPrice, tax: fromCents(toCents(q.tax) / q.quantity) }],
      })
      const updated = await repos.checkouts.update(id, { paypalOrderId: orderId })
      await record(updated, 'paypal.order_created', `PayPal order created for $${q.total} carrying the mandate fingerprint ${shortFingerprint(mandate.fingerprint)}`, { paypalRef: orderId })
      return { orderId }
    },

    /** The check before capture, then capture. Money only moves if every check passes. */
    async capture(id: string) {
      const checkout = await load(id)
      if (checkout.status === 'paid') return checkout
      if (!checkout.paypalOrderId) throw new AppError('conflict', 'Create the PayPal order first')
      const mandate = await mandateOf(checkout)
      const merchant = await tenant(checkout.merchantId)
      const shopper = await repos.shoppers.get(checkout.shopperId)
      const gateway = payments.forTenant(merchant)

      const order = await gateway.getOrder(checkout.paypalOrderId)
      const verdict = verifyBeforeCapture({ checkout, mandate, order, boundPayerId: shopper?.paypalPayerId ?? null, now: clock.now() })
      if (!verdict.ok) {
        const failed = await repos.checkouts.update(id, { status: 'failed', failureReason: verdict.failures.join('; ') })
        await record(failed, 'checkout.capture_refused', `Not captured: ${verdict.failures.join('; ')}`, { paypalRef: order.id })
        throw new AppError('mandate_violation', 'The PayPal order no longer matches the mandate, so it was not captured', { failures: verdict.failures })
      }

      // Reserve the mandate use first; give it back if PayPal refuses the capture.
      const reserved = await repos.mandates.consumeUse(mandate.id, checkout.quote.total)
      if (!reserved) throw new AppError('conflict', 'The mandate was used by another order')
      let capture
      try {
        capture = await gateway.captureOrder(order.id, `capture-${checkout.id}`)
      } catch (error) {
        await repos.mandates.update(mandate.id, {
          usesLeft: reserved.usesLeft + 1,
          budgetSpent: subtractMoney(reserved.budgetSpent, checkout.quote.total),
          status: 'active',
        })
        throw error
      }

      if (verdict.bindPayerId) await repos.shoppers.bindPayer(checkout.shopperId, verdict.bindPayerId)
      const paid = await repos.checkouts.update(id, { status: 'paid', captureId: capture.captureId, payerId: capture.payerId ?? order.payerId })
      await record(paid, 'order.captured', `Paid $${checkout.quote.total} via PayPal (${capture.status}). Mandate used: $${addMoney(mandate.budgetSpent, checkout.quote.total)} of $${mandate.body.budget.max_total}`, {
        paypalRef: capture.captureId,
        notify: 'order.captured',
        data: { order_id: order.id },
      })
      return paid
    },

    /** PAYMENT.CAPTURE.COMPLETED arrived (e.g. a capture that was PENDING). */
    async onCaptureCompleted(orderId: string, captureId: string) {
      const checkout = await repos.checkouts.findByPaypalOrderId(orderId)
      if (!checkout || checkout.status === 'paid') return
      await repos.checkouts.update(checkout.id, { status: 'paid', captureId })
    },

    payUrl,
    needsAcceptance,
  }
}

export type CheckoutService = ReturnType<typeof createCheckoutService>

export function presentCheckout(c: Checkout, extra: { payUrl?: string } = {}) {
  return {
    id: c.id,
    status: c.status,
    mandate_id: c.mandateId,
    merchant_id: c.merchantId,
    agent_id: c.agentId,
    product_title: c.productTitle,
    quote: c.quote,
    checks: presentChecks(c.checks),
    ai_judged_fields: c.aiJudgedFields,
    flagged: c.flagged,
    override: c.override,
    paypal_order_id: c.paypalOrderId,
    capture_id: c.captureId,
    payer_id: c.payerId,
    failure_reason: c.failureReason,
    created_at: c.createdAt.toISOString(),
    ...(extra.payUrl ? { pay_url: extra.payUrl } : {}),
  }
}
