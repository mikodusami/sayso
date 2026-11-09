// Entity types shared by every layer. Plain data only - no behaviour, no I/O.
import type { Money } from '../shared'
import type { MandateBody } from './mandate/schema'
import type { CheckResult } from './guard/types'
import type { FaultDecision } from './faults/types'
import type { ComplaintType } from './faults/types'
import type { SettlementStatus } from './settlement/state'

export type TenantType = 'merchant' | 'agent_provider'
export type VerifierMode = 'block' | 'flag'

export interface MerchantSettings {
  verifierMode: VerifierMode
  autoRefundLimit: Money
  returnPolicy: string
}

export interface PayPalAccount {
  clientId: string
  secretEnc: string // encrypted with SecretBox, never returned by the API
  webhookId: string | null
  email: string | null
}

export interface Tenant {
  id: string
  type: TenantType
  name: string
  paypal: PayPalAccount | null
  settings: MerchantSettings
  createdAt: Date
}

export interface ApiKey {
  id: string
  tenantId: string
  prefix: string
  hash: string
  createdAt: Date
  revokedAt: Date | null
}

export interface Shopper {
  id: string
  agentProviderId: string
  externalRef: string
  displayName: string
  paypalPayerId: string | null
}

export interface Agent {
  id: string
  tenantId: string
  name: string
  runsGuard: boolean
}

export interface Product {
  id: string
  merchantId: string
  sku: string
  title: string
  category: string
  attributes: Record<string, string>
  price: Money
  shipping: Money
  tax: Money
  stock: number
  shipsInDays: number
}

export type MandateStatus = 'pending_approval' | 'active' | 'used' | 'expired' | 'revoked'

export interface MandateApproval {
  approvedAt: string
  fingerprintShown: string
  method: 'click' | 'passkey'
  userAgent: string | null
}

export interface Mandate {
  id: string
  shopperId: string
  agentProviderId: string
  body: MandateBody
  canonical: string
  fingerprint: string
  status: MandateStatus
  approval: MandateApproval | null
  usesLeft: number
  budgetSpent: Money
  expiresAt: Date
  createdAt: Date
}

export interface Quote {
  merchantId: string
  sku: string
  quantity: number
  unitPrice: Money
  itemTotal: Money
  shipping: Money
  tax: Money
  total: Money
  currency: 'USD'
  arrivesBy: string // YYYY-MM-DD
}

export type CheckoutStatus = 'needs_shopper' | 'ready_for_payment' | 'blocked' | 'paid' | 'failed'

export interface ShopperOverride {
  acceptedAt: string
  warnings: string[]
}

export interface Checkout {
  id: string
  mandateId: string
  merchantId: string
  agentId: string
  agentProviderId: string
  shopperId: string
  productTitle: string
  quote: Quote
  checks: CheckResult[]
  aiJudgedFields: string[]
  flagged: boolean
  override: ShopperOverride | null
  status: CheckoutStatus
  paypalOrderId: string | null
  captureId: string | null
  payerId: string | null
  failureReason: string | null
  createdAt: Date
}

export interface Shipment {
  id: string
  checkoutId: string
  carrier: string
  trackingNumber: string
  shippedSku: string
  paypalTrackerId: string | null
  status: 'shipped' | 'delivered'
  deliveredAt: Date | null
  createdAt: Date
}

export interface ComplaintClassification {
  type: ComplaintType
  contestedFields: string[]
  summary: string
}

export interface Complaint {
  id: string
  checkoutId: string
  source: 'api' | 'hosted' | 'paypal_dispute'
  text: string
  paypalDisputeId: string | null
  classification: ComplaintClassification
  createdAt: Date
}

export interface Finding {
  id: string
  complaintId: string
  checkoutId: string
  merchantId: string
  agentProviderId: string
  decision: FaultDecision
  facts: Record<string, unknown>
  explanation: string
  amount: Money
  status: SettlementStatus
  refundId: string | null
  payoutBatchId: string | null
  failureReason: string | null
  createdAt: Date
}

export interface TimelineEvent {
  id: string
  tenantIds: string[]
  subjectType: 'mandate' | 'checkout' | 'finding' | 'tenant'
  subjectId: string
  kind: string
  actor: string
  message: string
  paypalRef: string | null
  data: Record<string, unknown>
  createdAt: Date
}

export interface WebhookEndpoint {
  id: string
  tenantId: string
  url: string
  secret: string
}
