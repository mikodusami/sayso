import type { ComplaintType } from './types'

/** PayPal dispute reasons map straight to complaint types - no AI needed. */
export function complaintTypeForDisputeReason(reason: string): ComplaintType {
  switch (reason) {
    case 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED':
      return 'not_received'
    case 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED':
      return 'wrong_detail'
    case 'UNAUTHORISED':
    case 'UNAUTHORIZED':
      return 'did_not_buy'
    case 'DUPLICATE_TRANSACTION':
    case 'INCORRECT_AMOUNT':
      return 'other'
    default:
      return 'other'
  }
}
