import { and, arrayContains, desc, eq, gt, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import type { Mandate, TimelineEvent } from '../../domain'
import type { Repositories } from '../../ports'
import type { Db } from './client'
import * as t from './schema'

// Rows and entities share field names (camelCase keys, snake_case columns),
// so mapping is mostly a pass-through.

function one<T>(rows: T[]): T | null {
  return rows[0] ?? null
}

function must<T>(rows: T[], what: string): T {
  const row = rows[0]
  if (!row) throw new Error(`${what} not found`)
  return row
}

export function createDrizzleRepositories(db: Db): Repositories {
  return {
    tenants: {
      async create(tenant) {
        return must(await db.insert(t.tenants).values(tenant).returning(), 'tenant')
      },
      async get(id) {
        return one(await db.select().from(t.tenants).where(eq(t.tenants.id, id)))
      },
      async update(id, patch) {
        return must(await db.update(t.tenants).set(patch).where(eq(t.tenants.id, id)).returning(), `tenant ${id}`)
      },
      async list() {
        return db.select().from(t.tenants).orderBy(t.tenants.createdAt)
      },
    },

    apiKeys: {
      async create(key) {
        return must(await db.insert(t.apiKeys).values(key).returning(), 'api key')
      },
      async findByHash(hash) {
        return one(await db.select().from(t.apiKeys).where(eq(t.apiKeys.hash, hash)))
      },
    },

    shoppers: {
      async getOrCreate(input) {
        await db.insert(t.shoppers).values({ ...input, paypalPayerId: null }).onConflictDoNothing()
        return must(
          await db
            .select()
            .from(t.shoppers)
            .where(and(eq(t.shoppers.agentProviderId, input.agentProviderId), eq(t.shoppers.externalRef, input.externalRef))),
          'shopper',
        )
      },
      async get(id) {
        return one(await db.select().from(t.shoppers).where(eq(t.shoppers.id, id)))
      },
      async bindPayer(id, payerId) {
        await db.update(t.shoppers).set({ paypalPayerId: payerId }).where(eq(t.shoppers.id, id))
      },
    },

    agents: {
      async upsert(agent) {
        return must(
          await db.insert(t.agents).values(agent).onConflictDoUpdate({ target: t.agents.id, set: agent }).returning(),
          'agent',
        )
      },
      async get(id) {
        return one(await db.select().from(t.agents).where(eq(t.agents.id, id)))
      },
      async listForTenant(tenantId) {
        return db.select().from(t.agents).where(eq(t.agents.tenantId, tenantId))
      },
    },

    products: {
      async upsert(product) {
        const { id: _id, ...changes } = product
        return must(
          await db
            .insert(t.products)
            .values(product)
            .onConflictDoUpdate({ target: [t.products.merchantId, t.products.sku], set: changes })
            .returning(),
          'product',
        )
      },
      async getBySku(merchantId, sku) {
        return one(await db.select().from(t.products).where(and(eq(t.products.merchantId, merchantId), eq(t.products.sku, sku))))
      },
      async search({ merchantIds, query, limit }) {
        const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
        const matches: SQL[] = words.flatMap((w) => [ilike(t.products.title, `%${w}%`), ilike(t.products.category, `%${w}%`)])
        const filters: SQL[] = []
        if (merchantIds?.length) filters.push(inArray(t.products.merchantId, merchantIds))
        if (matches.length) filters.push(or(...matches) as SQL)
        return db
          .select()
          .from(t.products)
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(sql`${t.products.price}::numeric`)
          .limit(limit)
      },
    },

    mandates: {
      async create(mandate) {
        return must(await db.insert(t.mandates).values(mandate).returning(), 'mandate') as Mandate
      },
      async get(id) {
        return one(await db.select().from(t.mandates).where(eq(t.mandates.id, id))) as Mandate | null
      },
      async update(id, patch) {
        return must(await db.update(t.mandates).set(patch).where(eq(t.mandates.id, id)).returning(), `mandate ${id}`) as Mandate
      },
      async consumeUse(id, amount) {
        const rows = await db
          .update(t.mandates)
          .set({
            usesLeft: sql`${t.mandates.usesLeft} - 1`,
            budgetSpent: sql`(${t.mandates.budgetSpent}::numeric + ${amount}::numeric)::text`,
            status: sql`case when ${t.mandates.usesLeft} - 1 <= 0 then 'used' else ${t.mandates.status} end`,
          })
          .where(and(eq(t.mandates.id, id), gt(t.mandates.usesLeft, 0), eq(t.mandates.status, 'active')))
          .returning()
        return one(rows) as Mandate | null
      },
    },

    checkouts: {
      async create(checkout) {
        return must(await db.insert(t.checkouts).values(checkout).returning(), 'checkout')
      },
      async get(id) {
        return one(await db.select().from(t.checkouts).where(eq(t.checkouts.id, id)))
      },
      async update(id, patch) {
        return must(await db.update(t.checkouts).set(patch).where(eq(t.checkouts.id, id)).returning(), `checkout ${id}`)
      },
      async findByPaypalOrderId(orderId) {
        return one(await db.select().from(t.checkouts).where(eq(t.checkouts.paypalOrderId, orderId)))
      },
      async findByCaptureId(captureId) {
        return one(await db.select().from(t.checkouts).where(eq(t.checkouts.captureId, captureId)))
      },
      async listForMerchant(merchantId, limit) {
        return db.select().from(t.checkouts).where(eq(t.checkouts.merchantId, merchantId)).orderBy(desc(t.checkouts.createdAt)).limit(limit)
      },
      async listForAgentProvider(agentProviderId, limit) {
        return db
          .select()
          .from(t.checkouts)
          .where(eq(t.checkouts.agentProviderId, agentProviderId))
          .orderBy(desc(t.checkouts.createdAt))
          .limit(limit)
      },
    },

    shipments: {
      async create(shipment) {
        return must(await db.insert(t.shipments).values(shipment).returning(), 'shipment')
      },
      async latestForCheckout(checkoutId) {
        return one(
          await db.select().from(t.shipments).where(eq(t.shipments.checkoutId, checkoutId)).orderBy(desc(t.shipments.createdAt)).limit(1),
        )
      },
      async update(id, patch) {
        return must(await db.update(t.shipments).set(patch).where(eq(t.shipments.id, id)).returning(), `shipment ${id}`)
      },
    },

    complaints: {
      async create(complaint) {
        return must(await db.insert(t.complaints).values(complaint).returning(), 'complaint')
      },
      async get(id) {
        return one(await db.select().from(t.complaints).where(eq(t.complaints.id, id)))
      },
      async findByDisputeId(disputeId) {
        return one(await db.select().from(t.complaints).where(eq(t.complaints.paypalDisputeId, disputeId)))
      },
    },

    findings: {
      async create(finding) {
        return must(await db.insert(t.findings).values(finding).returning(), 'finding')
      },
      async get(id) {
        return one(await db.select().from(t.findings).where(eq(t.findings.id, id)))
      },
      async update(id, patch) {
        return must(await db.update(t.findings).set(patch).where(eq(t.findings.id, id)).returning(), `finding ${id}`)
      },
      async findByRefundId(refundId) {
        return one(await db.select().from(t.findings).where(eq(t.findings.refundId, refundId)))
      },
      async findByPayoutBatchId(batchId) {
        return one(await db.select().from(t.findings).where(eq(t.findings.payoutBatchId, batchId)))
      },
      async listForMerchant(merchantId, limit) {
        return db.select().from(t.findings).where(eq(t.findings.merchantId, merchantId)).orderBy(desc(t.findings.createdAt)).limit(limit)
      },
      async listForAgentProvider(agentProviderId, limit) {
        return db
          .select()
          .from(t.findings)
          .where(eq(t.findings.agentProviderId, agentProviderId))
          .orderBy(desc(t.findings.createdAt))
          .limit(limit)
      },
      async listForCheckout(checkoutId) {
        return db.select().from(t.findings).where(eq(t.findings.checkoutId, checkoutId)).orderBy(desc(t.findings.createdAt))
      },
    },

    events: {
      async append(event) {
        await db.insert(t.events).values(event)
      },
      async listForSubject(subjectType, subjectId) {
        return (await db
          .select()
          .from(t.events)
          .where(and(eq(t.events.subjectType, subjectType), eq(t.events.subjectId, subjectId)))
          .orderBy(t.events.createdAt)) as TimelineEvent[]
      },
      async listForTenant(tenantId, limit) {
        return (await db
          .select()
          .from(t.events)
          .where(arrayContains(t.events.tenantIds, [tenantId]))
          .orderBy(desc(t.events.createdAt))
          .limit(limit)) as TimelineEvent[]
      },
      async listForSubjects(subjectIds) {
        if (!subjectIds.length) return []
        return (await db.select().from(t.events).where(inArray(t.events.subjectId, subjectIds)).orderBy(t.events.createdAt)) as TimelineEvent[]
      },
    },

    idempotency: {
      async get(tenantId, key) {
        return one(
          await db.select().from(t.idempotencyKeys).where(and(eq(t.idempotencyKeys.tenantId, tenantId), eq(t.idempotencyKeys.key, key))),
        )
      },
      async put(record) {
        await db.insert(t.idempotencyKeys).values(record).onConflictDoNothing()
      },
    },

    webhookEndpoints: {
      async create(endpoint) {
        return must(await db.insert(t.webhookEndpoints).values(endpoint).returning(), 'webhook endpoint')
      },
      async listForTenant(tenantId) {
        return db.select().from(t.webhookEndpoints).where(eq(t.webhookEndpoints.tenantId, tenantId))
      },
    },

    paypalEvents: {
      async recordIfNew(input) {
        const rows = await db.insert(t.paypalEvents).values(input).onConflictDoNothing().returning({ id: t.paypalEvents.id })
        return rows.length > 0
      },
    },

    async wipe() {
      for (const table of Object.values(t.schema)) {
        await db.delete(table)
      }
    },
  }
}
