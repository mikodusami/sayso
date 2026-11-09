import type { PaymentsProvider, Repositories } from '../../ports'
import { AppError, notFound } from '../../shared'
import type { CheckoutService } from '../checkouts'
import type { FindingService } from '../findings'
import type { SettlementService } from '../settlement'

export interface PayPalWebhookDeps {
  repos: Repositories
  payments: PaymentsProvider
  checkouts: CheckoutService
  settlement: SettlementService
  findings: FindingService
}

interface PayPalEvent {
  id: string
  event_type: string
  resource?: Record<string, any>
}

/**
 * Verify -> de-duplicate -> route. PayPal retries deliveries, so every event
 * id is processed once. Unknown event types are recorded and ignored.
 */
export function createPayPalWebhookService({ repos, payments, checkouts, settlement, findings }: PayPalWebhookDeps) {
  return {
    async handle(tenantId: string, headers: Record<string, string | undefined>, event: PayPalEvent) {
      const tenant = await repos.tenants.get(tenantId)
      if (!tenant) throw notFound('Tenant', tenantId)
      if (!event?.id || !event.event_type) throw new AppError('invalid_request', 'Not a PayPal webhook event')

      if (payments.mode === 'paypal') {
        const webhookId = tenant.paypal?.webhookId
        if (!webhookId) throw new AppError('invalid_request', `${tenant.name} has no PayPal webhook id configured`)
        const ok = await payments.forTenant(tenant).verifyWebhook({ webhookId, headers, event })
        if (!ok) throw new AppError('unauthorized', 'PayPal webhook signature did not verify')
      }

      const fresh = await repos.paypalEvents.recordIfNew({ id: event.id, tenantId, type: event.event_type, payload: event })
      if (!fresh) return { handled: false, duplicate: true }

      const r = event.resource ?? {}
      switch (event.event_type) {
        case 'PAYMENT.CAPTURE.COMPLETED': {
          const orderId = r.supplementary_data?.related_ids?.order_id
          if (orderId && r.id) await checkouts.onCaptureCompleted(orderId, r.id)
          break
        }
        case 'PAYMENT.CAPTURE.REFUNDED':
          // The resource is the refund itself.
          if (r.id) await settlement.onRefundCompleted(r.id)
          break
        case 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED':
          if (r.payout_batch_id) await settlement.onPayoutSucceeded(r.payout_batch_id)
          break
        case 'PAYMENT.PAYOUTSBATCH.SUCCESS':
          if (r.batch_header?.payout_batch_id) await settlement.onPayoutSucceeded(r.batch_header.payout_batch_id)
          break
        case 'PAYMENT.PAYOUTS-ITEM.FAILED':
        case 'PAYMENT.PAYOUTS-ITEM.DENIED':
        case 'PAYMENT.PAYOUTS-ITEM.RETURNED':
          if (r.payout_batch_id) await settlement.onPayoutFailed(r.payout_batch_id, event.event_type)
          break
        case 'CUSTOMER.DISPUTE.CREATED': {
          const captureId = r.disputed_transactions?.[0]?.seller_transaction_id
          if (captureId && r.dispute_id) {
            await findings.fromDispute({
              captureId,
              disputeId: r.dispute_id,
              reason: r.reason ?? 'OTHER',
              message: r.messages?.[0]?.content ?? '',
            })
          }
          break
        }
        default:
          return { handled: false, duplicate: false }
      }
      return { handled: true, duplicate: false }
    },
  }
}

export type PayPalWebhookService = ReturnType<typeof createPayPalWebhookService>
