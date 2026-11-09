import { describe, expect, it } from 'vitest'
import { complaintTypeForDisputeReason, decideFault, explainDecision, type FaultFacts } from '../../src/domain'

const base: FaultFacts = {
  type: 'wrong_detail',
  contestedFields: ['size'],
  payerMatches: true,
  orderedSku: 'RTR-GRY-10',
  shippedSku: 'RTR-GRY-10',
  delivered: true,
  deliverBy: '2026-11-13',
  today: '2026-11-12',
  flagged: false,
  override: false,
  aiJudgedFields: [],
}
const rule = (facts: Partial<FaultFacts>) => decideFault({ ...base, ...facts })

describe('fault rules', () => {
  it('R1: "I did not buy this" goes to PayPal', () => {
    expect(rule({ type: 'did_not_buy' })).toEqual({ rule: 'R1', fault: 'paypal', action: 'route_to_paypal' })
  })
  it('R1: a payer mismatch goes to PayPal even if the item is wrong', () => {
    expect(rule({ payerMatches: false, shippedSku: 'RTR-GRY-9' }).rule).toBe('R1')
  })
  it('R2: merchant shipped a different SKU', () => {
    expect(rule({ shippedSku: 'RTR-GRY-9' })).toEqual({ rule: 'R2', fault: 'merchant', action: 'refund' })
  })
  it('R2 beats R6: shipping the wrong item is the merchant even on a flagged order', () => {
    expect(rule({ shippedSku: 'RTR-GRY-9', flagged: true }).rule).toBe('R2')
  })
  it('R3: not delivered after the deadline', () => {
    expect(rule({ type: 'not_received', delivered: false, today: '2026-11-14' }).rule).toBe('R3')
  })
  it('R4: damaged', () => {
    expect(rule({ type: 'damaged' }).fault).toBe('merchant')
  })
  it('R5: outside the mandate but the shopper accepted a warning', () => {
    expect(rule({ flagged: true, override: true })).toEqual({ rule: 'R5', fault: 'shopper', action: 'return_policy' })
  })
  it('R6: outside the mandate, no warning accepted - the agent pays', () => {
    expect(rule({ flagged: true })).toEqual({ rule: 'R6', fault: 'agent', action: 'refund_and_reimburse' })
  })
  it('R7: the contested field passed only on AI judgement', () => {
    expect(rule({ type: 'wrong_detail', contestedFields: ['colour'], aiJudgedFields: ['colour'] }).rule).toBe('R7')
  })
  it('R7 does not apply when a different field is contested', () => {
    expect(rule({ contestedFields: ['size'], aiJudgedFields: ['colour'] }).rule).toBe('R9')
  })
  it('R8: not received but the deadline has not passed', () => {
    expect(rule({ type: 'not_received', delivered: false, today: '2026-11-12' })).toEqual({ rule: 'R8', fault: 'none_yet', action: 'inform' })
  })
  it('R8: no deadline set means not late yet', () => {
    expect(rule({ type: 'late', delivered: false, deliverBy: null }).rule).toBe('R8')
  })
  it('R9: everything matched and arrived (changed mind)', () => {
    expect(rule({ type: 'changed_mind', contestedFields: [] })).toEqual({ rule: 'R9', fault: 'none', action: 'return_policy_and_evidence' })
  })
})

describe('explanations', () => {
  it('names the facts and the amount from the decision', () => {
    const facts = { ...base, flagged: true }
    const text = explainDecision(decideFault(facts), facts, {
      agentName: 'QuickCart', merchantName: 'Trailhead Running Co.', amount: '118.00', asked: 'size 10', bought: 'size 9',
    })
    expect(text).toBe('You asked for size 10. QuickCart ordered size 9. QuickCart is responsible. Your $118.00 refund is on its way, and QuickCart repays Trailhead Running Co..')
  })
})

describe('PayPal dispute reasons', () => {
  it.each([
    ['MERCHANDISE_OR_SERVICE_NOT_RECEIVED', 'not_received'],
    ['MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', 'wrong_detail'],
    ['UNAUTHORISED', 'did_not_buy'],
    ['SOMETHING_NEW', 'other'],
  ])('%s -> %s', (reason, type) => expect(complaintTypeForDisputeReason(reason)).toBe(type))
})
