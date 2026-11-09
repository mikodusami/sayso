export const COMPLAINT_TYPES = [
  'wrong_detail',
  'wrong_item',
  'not_received',
  'late',
  'damaged',
  'changed_mind',
  'did_not_buy',
  'other',
] as const
export type ComplaintType = (typeof COMPLAINT_TYPES)[number]

export type Fault = 'paypal' | 'merchant' | 'agent' | 'shopper' | 'none' | 'none_yet'

export type FaultAction =
  | 'route_to_paypal'
  | 'refund'
  | 'refund_and_reimburse'
  | 'return_policy'
  | 'return_policy_and_evidence'
  | 'inform'

export type FaultRule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9'

export interface FaultDecision {
  rule: FaultRule
  fault: Fault
  action: FaultAction
}

/** Everything the rules look at. Built from Sayso and PayPal records only. */
export interface FaultFacts {
  type: ComplaintType
  contestedFields: string[]
  payerMatches: boolean
  orderedSku: string
  shippedSku: string | null
  delivered: boolean
  deliverBy: string | null // YYYY-MM-DD
  today: string // YYYY-MM-DD
  flagged: boolean // order was outside the mandate when placed
  override: boolean // shopper accepted a warning
  aiJudgedFields: string[]
}
