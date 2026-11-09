import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type {
  CheckResult,
  ComplaintClassification,
  FaultDecision,
  MandateApproval,
  MandateBody,
  MerchantSettings,
  PayPalAccount,
  Quote,
  ShopperOverride,
} from '../../domain'

// Column keys are camelCase; the database uses snake_case (casing option).
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

export const tenants = pgTable('tenants', {
  id: text().primaryKey(),
  type: text().$type<'merchant' | 'agent_provider'>().notNull(),
  name: text().notNull(),
  paypal: jsonb().$type<PayPalAccount | null>(),
  settings: jsonb().$type<MerchantSettings>().notNull(),
  createdAt: createdAt(),
})

export const apiKeys = pgTable('api_keys', {
  id: text().primaryKey(),
  tenantId: text().notNull(),
  prefix: text().notNull(),
  hash: text().notNull().unique(),
  createdAt: createdAt(),
  revokedAt: timestamp({ withTimezone: true }),
})

export const shoppers = pgTable(
  'shoppers',
  {
    id: text().primaryKey(),
    agentProviderId: text().notNull(),
    externalRef: text().notNull(),
    displayName: text().notNull(),
    paypalPayerId: text(),
  },
  (t) => [uniqueIndex('shoppers_provider_ref').on(t.agentProviderId, t.externalRef)],
)

export const agents = pgTable('agents', {
  id: text().primaryKey(),
  tenantId: text().notNull(),
  name: text().notNull(),
  runsGuard: boolean().notNull(),
})

export const products = pgTable(
  'products',
  {
    id: text().primaryKey(),
    merchantId: text().notNull(),
    sku: text().notNull(),
    title: text().notNull(),
    category: text().notNull(),
    attributes: jsonb().$type<Record<string, string>>().notNull(),
    price: text().notNull(),
    shipping: text().notNull(),
    tax: text().notNull(),
    stock: integer().notNull(),
    shipsInDays: integer().notNull(),
  },
  (t) => [uniqueIndex('products_merchant_sku').on(t.merchantId, t.sku)],
)

export const mandates = pgTable('mandates', {
  id: text().primaryKey(),
  shopperId: text().notNull(),
  agentProviderId: text().notNull(),
  body: jsonb().$type<MandateBody>().notNull(),
  canonical: text().notNull(),
  fingerprint: text().notNull().unique(),
  status: text().$type<'pending_approval' | 'active' | 'used' | 'expired' | 'revoked'>().notNull(),
  approval: jsonb().$type<MandateApproval | null>(),
  usesLeft: integer().notNull(),
  budgetSpent: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
})

export const checkouts = pgTable('checkouts', {
  id: text().primaryKey(),
  mandateId: text().notNull(),
  merchantId: text().notNull(),
  agentId: text().notNull(),
  agentProviderId: text().notNull(),
  shopperId: text().notNull(),
  productTitle: text().notNull(),
  quote: jsonb().$type<Quote>().notNull(),
  checks: jsonb().$type<CheckResult[]>().notNull(),
  aiJudgedFields: jsonb().$type<string[]>().notNull(),
  flagged: boolean().notNull(),
  override: jsonb().$type<ShopperOverride | null>(),
  status: text().$type<'needs_shopper' | 'ready_for_payment' | 'blocked' | 'paid' | 'failed'>().notNull(),
  paypalOrderId: text(),
  captureId: text(),
  payerId: text(),
  failureReason: text(),
  createdAt: createdAt(),
})

export const shipments = pgTable('shipments', {
  id: text().primaryKey(),
  checkoutId: text().notNull(),
  carrier: text().notNull(),
  trackingNumber: text().notNull(),
  shippedSku: text().notNull(),
  paypalTrackerId: text(),
  status: text().$type<'shipped' | 'delivered'>().notNull(),
  deliveredAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
})

export const complaints = pgTable('complaints', {
  id: text().primaryKey(),
  checkoutId: text().notNull(),
  source: text().$type<'api' | 'hosted' | 'paypal_dispute'>().notNull(),
  text: text().notNull(),
  paypalDisputeId: text(),
  classification: jsonb().$type<ComplaintClassification>().notNull(),
  createdAt: createdAt(),
})

export const findings = pgTable('findings', {
  id: text().primaryKey(),
  complaintId: text().notNull(),
  checkoutId: text().notNull(),
  merchantId: text().notNull(),
  agentProviderId: text().notNull(),
  decision: jsonb().$type<FaultDecision>().notNull(),
  facts: jsonb().$type<Record<string, unknown>>().notNull(),
  explanation: text().notNull(),
  amount: text().notNull(),
  status: text().$type<'proposed' | 'refunding' | 'reimbursing' | 'done' | 'failed' | 'appealed' | 'closed'>().notNull(),
  refundId: text(),
  payoutBatchId: text(),
  failureReason: text(),
  createdAt: createdAt(),
})

export const events = pgTable('events', {
  id: text().primaryKey(),
  tenantIds: text().array().notNull(),
  subjectType: text().$type<'mandate' | 'checkout' | 'finding' | 'tenant'>().notNull(),
  subjectId: text().notNull(),
  kind: text().notNull(),
  actor: text().notNull(),
  message: text().notNull(),
  paypalRef: text(),
  data: jsonb().$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
})

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    tenantId: text().notNull(),
    key: text().notNull(),
    requestHash: text().notNull(),
    status: integer().notNull(),
    body: jsonb().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
)

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: text().primaryKey(),
  tenantId: text().notNull(),
  url: text().notNull(),
  secret: text().notNull(),
})

export const paypalEvents = pgTable('paypal_events', {
  id: text().primaryKey(),
  tenantId: text().notNull(),
  type: text().notNull(),
  payload: jsonb().notNull(),
  receivedAt: createdAt(),
})

export const schema = {
  tenants,
  apiKeys,
  shoppers,
  agents,
  products,
  mandates,
  checkouts,
  shipments,
  complaints,
  findings,
  events,
  idempotencyKeys,
  webhookEndpoints,
  paypalEvents,
}
