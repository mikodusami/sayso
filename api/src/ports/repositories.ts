import type {
  Agent,
  ApiKey,
  Checkout,
  Complaint,
  Finding,
  Mandate,
  Product,
  Shipment,
  Shopper,
  Tenant,
  TimelineEvent,
  WebhookEndpoint,
} from '../domain'
import type { Money } from '../shared'

export interface TenantRepository {
  create(tenant: Tenant): Promise<Tenant>
  get(id: string): Promise<Tenant | null>
  update(id: string, patch: Partial<Omit<Tenant, 'id'>>): Promise<Tenant>
  list(): Promise<Tenant[]>
}

export interface ApiKeyRepository {
  create(key: ApiKey): Promise<ApiKey>
  findByHash(hash: string): Promise<ApiKey | null>
}

export interface ShopperRepository {
  getOrCreate(input: { id: string; agentProviderId: string; externalRef: string; displayName: string }): Promise<Shopper>
  get(id: string): Promise<Shopper | null>
  bindPayer(id: string, payerId: string): Promise<void>
}

export interface AgentRepository {
  upsert(agent: Agent): Promise<Agent>
  get(id: string): Promise<Agent | null>
  listForTenant(tenantId: string): Promise<Agent[]>
}

export interface ProductRepository {
  upsert(product: Product): Promise<Product>
  getBySku(merchantId: string, sku: string): Promise<Product | null>
  search(input: { merchantIds?: string[]; query: string; limit: number }): Promise<Product[]>
}

export interface MandateRepository {
  create(mandate: Mandate): Promise<Mandate>
  get(id: string): Promise<Mandate | null>
  update(id: string, patch: Partial<Omit<Mandate, 'id' | 'body' | 'canonical' | 'fingerprint'>>): Promise<Mandate>
  /** Atomically use one order's worth of the mandate. Returns null if nothing was left. */
  consumeUse(id: string, amount: Money): Promise<Mandate | null>
}

export interface CheckoutRepository {
  create(checkout: Checkout): Promise<Checkout>
  get(id: string): Promise<Checkout | null>
  update(id: string, patch: Partial<Omit<Checkout, 'id'>>): Promise<Checkout>
  findByPaypalOrderId(orderId: string): Promise<Checkout | null>
  findByCaptureId(captureId: string): Promise<Checkout | null>
  listForMerchant(merchantId: string, limit: number): Promise<Checkout[]>
  listForAgentProvider(agentProviderId: string, limit: number): Promise<Checkout[]>
}

export interface ShipmentRepository {
  create(shipment: Shipment): Promise<Shipment>
  latestForCheckout(checkoutId: string): Promise<Shipment | null>
  update(id: string, patch: Partial<Omit<Shipment, 'id'>>): Promise<Shipment>
}

export interface ComplaintRepository {
  create(complaint: Complaint): Promise<Complaint>
  get(id: string): Promise<Complaint | null>
  findByDisputeId(disputeId: string): Promise<Complaint | null>
}

export interface FindingRepository {
  create(finding: Finding): Promise<Finding>
  get(id: string): Promise<Finding | null>
  update(id: string, patch: Partial<Omit<Finding, 'id'>>): Promise<Finding>
  findByRefundId(refundId: string): Promise<Finding | null>
  findByPayoutBatchId(batchId: string): Promise<Finding | null>
  listForMerchant(merchantId: string, limit: number): Promise<Finding[]>
  listForAgentProvider(agentProviderId: string, limit: number): Promise<Finding[]>
  listForCheckout(checkoutId: string): Promise<Finding[]>
}

export interface EventRepository {
  append(event: TimelineEvent): Promise<void>
  listForSubject(subjectType: TimelineEvent['subjectType'], subjectId: string): Promise<TimelineEvent[]>
  listForTenant(tenantId: string, limit: number): Promise<TimelineEvent[]>
  listForSubjects(subjectIds: string[]): Promise<TimelineEvent[]>
}

export interface IdempotencyRecord {
  tenantId: string
  key: string
  requestHash: string
  status: number
  body: unknown
  createdAt: Date
}

export interface IdempotencyRepository {
  get(tenantId: string, key: string): Promise<IdempotencyRecord | null>
  put(record: IdempotencyRecord): Promise<void>
}

export interface WebhookEndpointRepository {
  create(endpoint: WebhookEndpoint): Promise<WebhookEndpoint>
  listForTenant(tenantId: string): Promise<WebhookEndpoint[]>
}

export interface PaypalEventRepository {
  /** Returns false if this PayPal event id was already recorded (PayPal retries). */
  recordIfNew(input: { id: string; tenantId: string; type: string; payload: unknown }): Promise<boolean>
}

export interface Repositories {
  tenants: TenantRepository
  apiKeys: ApiKeyRepository
  shoppers: ShopperRepository
  agents: AgentRepository
  products: ProductRepository
  mandates: MandateRepository
  checkouts: CheckoutRepository
  shipments: ShipmentRepository
  complaints: ComplaintRepository
  findings: FindingRepository
  events: EventRepository
  idempotency: IdempotencyRepository
  webhookEndpoints: WebhookEndpointRepository
  paypalEvents: PaypalEventRepository
  /** Deletes every row. Demo reset and tests only. */
  wipe(): Promise<void>
}
