import { canConfirm, canRetry, nextStep, reimburses, statusAfterRefund, type Finding, type Tenant } from '../../domain'
import type { PaymentsProvider, Repositories } from '../../ports'
import { AppError, notFound } from '../../shared'
import type { TimelineService } from '../timeline'

export interface SettlementDeps {
  repos: Repositories
  payments: PaymentsProvider
  timeline: TimelineService
}

const PAYOUT_DONE = new Set(['SUCCESS'])
const PAYOUT_FAILED = new Set(['DENIED', 'CANCELED', 'FAILED'])

/**
 * Runs a finding's money movement as a small state machine:
 * refund (merchant's PayPal) -> reimbursement payout (agent provider's PayPal).
 * Each step uses an idempotency key derived from the finding id, so retrying
 * after a crash or a double click never moves money twice.
 */
export function createSettlementService({ repos, payments, timeline }: SettlementDeps) {
  async function tenant(id: string): Promise<Tenant> {
    const t = await repos.tenants.get(id)
    if (!t) throw notFound('Tenant', id)
    return t
  }

  const record = (f: Finding, kind: string, message: string, paypalRef: string | null = null, notify?: string) =>
    timeline.record({
      tenantIds: [f.merchantId, f.agentProviderId],
      subjectType: 'finding',
      subjectId: f.id,
      kind,
      actor: 'sayso',
      message,
      paypalRef,
      notify,
      data: { checkout_id: f.checkoutId, rule: f.decision.rule },
    })

  async function fail(finding: Finding, error: unknown): Promise<Finding> {
    const reason = error instanceof Error ? error.message : String(error)
    const failed = await repos.findings.update(finding.id, { status: 'failed', failureReason: reason })
    await record(failed, 'settlement.failed', `Settlement stopped: ${reason}`)
    return failed
  }

  async function refund(finding: Finding): Promise<Finding> {
    const checkout = await repos.checkouts.get(finding.checkoutId)
    if (!checkout?.captureId) throw new AppError('conflict', 'This order has no PayPal capture to refund')
    const merchant = await tenant(finding.merchantId)
    const result = await payments.forTenant(merchant).refundCapture({
      requestId: `refund-${finding.id}`,
      captureId: checkout.captureId,
      amount: finding.amount,
      currency: 'USD',
      noteToPayer: `Sayso finding ${finding.decision.rule}: ${finding.explanation}`,
    })
    let updated = await repos.findings.update(finding.id, { refundId: result.refundId, status: 'refunding', failureReason: null })
    await record(updated, 'settlement.refunded', `Refunded $${finding.amount} to the shopper from ${merchant.name} (${result.status})`, result.refundId, 'finding.refunded')
    if (result.status === 'COMPLETED') updated = await afterRefund(updated)
    return updated
  }

  async function afterRefund(finding: Finding): Promise<Finding> {
    const status = statusAfterRefund(finding.decision)
    const updated = await repos.findings.update(finding.id, { status })
    if (status === 'reimbursing') return reimburse(updated)
    await record(updated, 'settlement.done', 'Settled.', null, 'finding.settled')
    return updated
  }

  async function reimburse(finding: Finding): Promise<Finding> {
    const merchant = await tenant(finding.merchantId)
    const provider = await tenant(finding.agentProviderId)
    const receiver = merchant.paypal?.email ?? (payments.mode === 'fake' ? `${merchant.id}@fake.paypal` : null)
    if (!receiver) throw new AppError('invalid_request', `${merchant.name} has no PayPal email to receive the reimbursement`)

    const result = await payments.forTenant(provider).createPayout({
      batchId: `reimb-${finding.id}`,
      itemId: finding.id,
      receiverEmail: receiver,
      amount: finding.amount,
      currency: 'USD',
      subject: `Sayso reimbursement for ${finding.checkoutId}`,
      note: `Agent-fault refund, rule ${finding.decision.rule}`,
    })
    const updated = await repos.findings.update(finding.id, { payoutBatchId: result.payoutBatchId, status: 'reimbursing' })
    await record(updated, 'settlement.reimbursing', `${provider.name} is repaying ${merchant.name} $${finding.amount} by PayPal payout (${result.status})`, result.payoutBatchId)
    return PAYOUT_DONE.has(result.status) ? finish(updated) : updated
  }

  async function finish(finding: Finding): Promise<Finding> {
    const done = await repos.findings.update(finding.id, { status: 'done' })
    await record(done, 'settlement.done', 'Settled: shopper refunded and merchant reimbursed by the agent provider.', finding.payoutBatchId, 'reimbursement.paid')
    return done
  }

  async function run(finding: Finding): Promise<Finding> {
    try {
      const step = nextStep(finding.status, finding.refundId, finding.decision)
      if (step === 'refund' && !finding.refundId) return await refund(finding)
      if (step === 'refund' && finding.refundId) return await afterRefund(finding)
      if (step === 'reimburse' && !finding.payoutBatchId) return await reimburse(finding)
      return finding
    } catch (error) {
      return fail(finding, error)
    }
  }

  async function load(id: string, merchantId?: string): Promise<Finding> {
    const finding = await repos.findings.get(id)
    if (!finding || (merchantId && finding.merchantId !== merchantId)) throw notFound('Finding', id)
    return finding
  }

  return {
    /** The merchant confirms; money moves. */
    async confirm(findingId: string, merchantId: string, actor = 'merchant'): Promise<Finding> {
      const finding = await load(findingId, merchantId)
      if (!canConfirm(finding.status)) throw new AppError('conflict', `Finding is ${finding.status}`)
      const confirmed = await repos.findings.update(finding.id, { status: 'refunding' })
      await record(confirmed, 'settlement.confirmed', `${actor === 'merchant' ? 'Merchant confirmed' : 'Auto-confirmed (under the auto-refund limit)'}: refund $${finding.amount}${reimburses(finding.decision) ? ', then reimbursement' : ''}`)
      return run(confirmed)
    },

    async retry(findingId: string, merchantId: string): Promise<Finding> {
      const finding = await load(findingId, merchantId)
      if (!canRetry(finding.status)) throw new AppError('conflict', `Finding is ${finding.status}`)
      return run(finding)
    },

    /** Polls PayPal for a payout that was still pending. */
    async refresh(findingId: string): Promise<Finding> {
      const finding = await load(findingId)
      if (finding.status !== 'reimbursing' || !finding.payoutBatchId) return finding
      const provider = await tenant(finding.agentProviderId)
      const status = await payments.forTenant(provider).getPayoutStatus(finding.payoutBatchId)
      if (PAYOUT_DONE.has(status)) return finish(finding)
      if (PAYOUT_FAILED.has(status)) return fail(finding, new Error(`Payout ${status}`))
      return finding
    },

    async onRefundCompleted(refundId: string) {
      const finding = await repos.findings.findByRefundId(refundId)
      if (finding?.status === 'refunding') await afterRefund(finding)
    },

    async onPayoutSucceeded(batchId: string) {
      const finding = await repos.findings.findByPayoutBatchId(batchId)
      if (finding?.status === 'reimbursing') await finish(finding)
    },

    async onPayoutFailed(batchId: string, reason: string) {
      const finding = await repos.findings.findByPayoutBatchId(batchId)
      if (finding?.status === 'reimbursing') await fail(finding, new Error(reason))
    },
  }
}

export type SettlementService = ReturnType<typeof createSettlementService>
