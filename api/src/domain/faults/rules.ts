import type { FaultDecision, FaultFacts } from './types'

/**
 * The fault rules, R1-R9. First match wins. AI never decides the outcome:
 * it can only help produce the facts (by sorting a complaint into a type).
 * Every branch is covered in test/domain/faults.test.ts.
 */
export function decideFault(f: FaultFacts): FaultDecision {
  // R1 - possible fraud or an unknown payer: PayPal's process, not ours.
  if (f.type === 'did_not_buy' || !f.payerMatches) {
    return { rule: 'R1', fault: 'paypal', action: 'route_to_paypal' }
  }
  // R2 - the merchant shipped something other than what was ordered.
  if (f.shippedSku !== null && f.shippedSku !== f.orderedSku) {
    return { rule: 'R2', fault: 'merchant', action: 'refund' }
  }
  const lateOrMissing = f.type === 'not_received' || f.type === 'late'
  const pastDeadline = f.deliverBy !== null && f.today > f.deliverBy
  // R3 - not delivered and the agreed deadline has passed.
  if (lateOrMissing && !f.delivered && pastDeadline) {
    return { rule: 'R3', fault: 'merchant', action: 'refund' }
  }
  // R4 - damaged in transit is the merchant's responsibility to the buyer.
  if (f.type === 'damaged') {
    return { rule: 'R4', fault: 'merchant', action: 'refund' }
  }
  // R5 - outside the mandate, but the shopper was warned and approved anyway.
  if (f.flagged && f.override) {
    return { rule: 'R5', fault: 'shopper', action: 'return_policy' }
  }
  // R6 - outside the mandate with no warning accepted: the agent's mistake.
  if (f.flagged) {
    return { rule: 'R6', fault: 'agent', action: 'refund_and_reimburse' }
  }
  // R7 - the contested detail passed only on the agent's judgement.
  if (f.contestedFields.some((field) => f.aiJudgedFields.includes(field))) {
    return { rule: 'R7', fault: 'agent', action: 'refund_and_reimburse' }
  }
  // R8 - not here yet, but still inside the deadline.
  if (lateOrMissing) {
    return { rule: 'R8', fault: 'none_yet', action: 'inform' }
  }
  // R9 - everything matched and arrived.
  return { rule: 'R9', fault: 'none', action: 'return_policy_and_evidence' }
}

export const movesMoney = (decision: FaultDecision): boolean =>
  decision.action === 'refund' || decision.action === 'refund_and_reimburse'

export const reimburses = (decision: FaultDecision): boolean => decision.action === 'refund_and_reimburse'
