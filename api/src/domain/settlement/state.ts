import { compareMoney, type Money } from '../../shared'
import { movesMoney, reimburses } from '../faults/rules'
import type { FaultDecision } from '../faults/types'

/**
 * A finding's settlement life:
 *
 *   proposed --confirm--> refunding --refund ok--> reimbursing --payout ok--> done
 *                              \                        \
 *                               `--refund ok (no reimbursement)--> done
 *   proposed --appeal--> appealed      any step --error--> failed
 *   closed: findings that move no money (R1, R5, R8, R9)
 */
export type SettlementStatus = 'proposed' | 'refunding' | 'reimbursing' | 'done' | 'failed' | 'appealed' | 'closed'

export function initialStatus(decision: FaultDecision): SettlementStatus {
  return movesMoney(decision) ? 'proposed' : 'closed'
}

/** Refunds at or under the merchant's limit skip the confirm click. */
export function needsMerchantConfirmation(amount: Money, autoRefundLimit: Money): boolean {
  return compareMoney(amount, autoRefundLimit) > 0
}

export const canConfirm = (status: SettlementStatus) => status === 'proposed'
export const canAppeal = (status: SettlementStatus) => status === 'proposed'
export const canRetry = (status: SettlementStatus) => status === 'failed'

export function statusAfterRefund(decision: FaultDecision): SettlementStatus {
  return reimburses(decision) ? 'reimbursing' : 'done'
}

export type SettlementStep = 'refund' | 'reimburse' | null

/** What to do next for a finding in this status (used for retries). */
export function nextStep(status: SettlementStatus, refundId: string | null, decision: FaultDecision): SettlementStep {
  if (status === 'refunding' || (status === 'failed' && !refundId && movesMoney(decision))) return 'refund'
  if (status === 'reimbursing' || (status === 'failed' && refundId && reimburses(decision))) return 'reimburse'
  return null
}
