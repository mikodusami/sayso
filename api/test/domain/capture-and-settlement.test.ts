import { describe, expect, it } from 'vitest'
import { initialStatus, needsMerchantConfirmation, nextStep, quoteFor, statusAfterRefund, verifyBeforeCapture } from '../../src/domain'
import { addMoney, fromCents, normaliseMoney, toCents } from '../../src/shared'
import { NOW, mandate, product } from '../support/fixtures'

const checkout = { quote: quoteFor(product(), 1, NOW), status: 'ready_for_payment' as const }
const goodOrder = () => ({ status: 'APPROVED', amount: '118.00', currency: 'USD', customId: mandate().fingerprint, payerId: 'PAYER_MAYA' })

describe('check before capture', () => {
  it('passes and binds the payer on the first payment', () => {
    const result = verifyBeforeCapture({ checkout, mandate: mandate(), order: goodOrder(), boundPayerId: null, now: NOW })
    expect(result).toEqual({ ok: true, failures: [], bindPayerId: 'PAYER_MAYA' })
  })

  it('stops capture when the amount changed after the guard', () => {
    const result = verifyBeforeCapture({ checkout, mandate: mandate(), order: { ...goodOrder(), amount: '126.00' }, boundPayerId: null, now: NOW })
    expect(result.ok).toBe(false)
    expect(result.failures).toContain('Amount changed from $118.00 to $126.00')
  })

  it('stops capture when someone else pays under the mandate', () => {
    const result = verifyBeforeCapture({ checkout, mandate: mandate(), order: { ...goodOrder(), payerId: 'PAYER_OTHER' }, boundPayerId: 'PAYER_MAYA', now: NOW })
    expect(result.failures).toContain('The PayPal payer is not the mandate holder')
  })

  it('stops capture when the order lacks the fingerprint or the mandate is used', () => {
    expect(verifyBeforeCapture({ checkout, mandate: mandate(), order: { ...goodOrder(), customId: 'x' }, boundPayerId: null, now: NOW }).ok).toBe(false)
    expect(verifyBeforeCapture({ checkout, mandate: mandate({ usesLeft: 0 }), order: goodOrder(), boundPayerId: null, now: NOW }).ok).toBe(false)
  })
})

describe('settlement steps', () => {
  const agentFault = { rule: 'R6', fault: 'agent', action: 'refund_and_reimburse' } as const
  const merchantFault = { rule: 'R2', fault: 'merchant', action: 'refund' } as const
  const noFault = { rule: 'R9', fault: 'none', action: 'return_policy_and_evidence' } as const

  it('only money-moving findings wait for confirmation', () => {
    expect(initialStatus(agentFault)).toBe('proposed')
    expect(initialStatus(noFault)).toBe('closed')
  })
  it('reimburses after the refund only when the agent is at fault', () => {
    expect(statusAfterRefund(agentFault)).toBe('reimbursing')
    expect(statusAfterRefund(merchantFault)).toBe('done')
  })
  it('knows how to resume a failed settlement', () => {
    expect(nextStep('failed', null, agentFault)).toBe('refund')
    expect(nextStep('failed', 'REFUND1', agentFault)).toBe('reimburse')
    expect(nextStep('failed', 'REFUND1', merchantFault)).toBe(null)
  })
  it('a $0.00 auto-refund limit means every refund is confirmed by the merchant', () => {
    expect(needsMerchantConfirmation('118.00', '0.00')).toBe(true)
    expect(needsMerchantConfirmation('18.00', '50.00')).toBe(false)
  })
})

describe('money', () => {
  it('never uses floating point', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30')
    expect(toCents('118.00')).toBe(11800)
    expect(fromCents(-5)).toBe('-0.05')
    expect(normaliseMoney('$120')).toBe('120.00')
  })
})
