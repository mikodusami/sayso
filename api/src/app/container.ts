// The composition root: the only file that knows which adapter backs each port.
import type { Hono } from 'hono'
import { createLinks, type AppEnv } from '../features/_kit'
import { createCatalogRoutes, createCatalogService } from '../features/catalog'
import { createCandidateEvaluator, createChecksRoutes, createChecksService } from '../features/checks'
import { createCheckoutRoutes, createCheckoutService } from '../features/checkouts'
import { createDemoRoutes, createDemoService, DEMO } from '../features/demo'
import { createFindingRoutes, createFindingService } from '../features/findings'
import { createLiabilityRoutes, createLiabilityService } from '../features/liabilities'
import { createMandateRoutes, createMandateService } from '../features/mandates'
import { createOrderRoutes, createOrderService } from '../features/orders'
import { createPayPalWebhookRoutes, createPayPalWebhookService } from '../features/paypal-webhooks'
import { createSettingsRoutes, createSettingsService } from '../features/settings'
import { createSettlementService } from '../features/settlement'
import { createTimelineRoutes, createTimelineService } from '../features/timeline'
import { createHttpApp } from '../http'
import { createGatewayAi, createGatewayShoppingAgent, createHeuristicAi, createScriptedShoppingAgent } from '../infrastructure/ai'
import { createSecretBox, createTokenSigner, hmacPayloadSigner, sha256Hasher } from '../infrastructure/crypto'
import { createDrizzleRepositories, openDatabase, type Database } from '../infrastructure/db'
import { createHttpNotifier } from '../infrastructure/notifier'
import { createFakePayments, createRestPaymentsProvider } from '../infrastructure/paypal'
import type { AiService, EventNotifier, PaymentsProvider, PaymentsSimulator, ShoppingAgent } from '../ports'
import { systemClock, type Clock, type Config } from '../shared'

export interface ContainerOverrides {
  clock?: Clock
  database?: Database
  payments?: { provider: PaymentsProvider; simulator: PaymentsSimulator | null }
  ai?: AiService
  agent?: ShoppingAgent
  notifier?: EventNotifier
  /** Seed the demo tenants when the database is empty (default true). */
  autoSeed?: boolean
}

export async function buildContainer(config: Config, overrides: ContainerOverrides = {}) {
  // --- infrastructure ------------------------------------------------------
  const database =
    overrides.database ??
    (await openDatabase({ driver: config.database.driver, url: config.database.url, pgliteDir: config.database.pgliteDir }))
  if (database.driver === 'pglite') await database.migrate()

  const repos = createDrizzleRepositories(database.db)
  const clock = overrides.clock ?? systemClock
  const secretBox = createSecretBox(config.secrets.encryptionKey)
  const tokens = createTokenSigner(config.secrets.linkSecret, () => clock.now())
  const hasher = sha256Hasher
  const notifier = overrides.notifier ?? createHttpNotifier(hmacPayloadSigner)

  let payments: PaymentsProvider
  let simulator: PaymentsSimulator | null = null
  if (overrides.payments) {
    payments = overrides.payments.provider
    simulator = overrides.payments.simulator
  } else if (config.payments.driver === 'paypal') {
    payments = createRestPaymentsProvider({ apiBase: config.payments.apiBase, secretBox })
  } else {
    const fake = createFakePayments()
    payments = fake
    simulator = fake
  }

  const ai = overrides.ai ?? (config.ai.driver === 'gateway' ? createGatewayAi({ fastModel: config.ai.fastModel }) : createHeuristicAi())
  const agent =
    overrides.agent ?? (config.ai.driver === 'gateway' ? createGatewayShoppingAgent({ model: config.ai.smartModel }) : createScriptedShoppingAgent())

  // --- features ------------------------------------------------------------
  const links = createLinks(config.webOrigin)
  const timeline = createTimelineService({ repos, notifier, clock })
  const catalog = createCatalogService({ repos })
  const mandates = createMandateService({ repos, ai, tokens, timeline, links, clock })
  const evaluator = createCandidateEvaluator({ ai, clock })
  const checks = createChecksService({ repos, evaluator })
  const checkouts = createCheckoutService({ repos, payments, evaluator, timeline, tokens, links, clock })
  const orders = createOrderService({ repos, payments, timeline, clock })
  const settlement = createSettlementService({ repos, payments, timeline })
  const findings = createFindingService({ repos, ai, settlement, timeline, clock })
  const paypalWebhooks = createPayPalWebhookService({ repos, payments, checkouts, settlement, findings })
  const liabilities = createLiabilityService({ repos })
  const settings = createSettingsService({ repos, timeline })
  const demo = createDemoService({
    repos,
    catalog,
    mandates,
    checks,
    checkouts,
    agent,
    payments,
    simulator,
    tokens,
    hasher,
    secretBox,
    clock,
    aiName: ai.name,
    seedPayPal: config.seed,
  })

  if ((overrides.autoSeed ?? true) && !(await repos.tenants.get(DEMO.merchantId))) await demo.seed()

  // --- http ----------------------------------------------------------------
  const routes: Array<Hono<AppEnv>> = [
    createTimelineRoutes(timeline),
    createCatalogRoutes(catalog),
    createMandateRoutes(mandates),
    createChecksRoutes(checks),
    createCheckoutRoutes({ checkouts, timeline }),
    createOrderRoutes(orders),
    createFindingRoutes({ findings, settlement, checkouts, timeline }),
    createLiabilityRoutes(liabilities),
    createSettingsRoutes(settings),
    createPayPalWebhookRoutes(paypalWebhooks),
    createDemoRoutes(demo, { adminToken: config.demoAdminToken }),
  ]

  const app = createHttpApp({
    auth: { repos, hasher, tokens },
    idempotency: repos,
    now: () => clock.now(),
    webOrigin: config.webOrigin,
    routes,
    info: { payments: payments.mode, ai: ai.name, agent: agent.name, database: database.driver },
  })

  return {
    config,
    app,
    repos,
    clock,
    simulator,
    services: { timeline, catalog, mandates, checks, checkouts, orders, settlement, findings, paypalWebhooks, liabilities, settings, demo },
    close: () => database.close(),
  }
}

export type Container = Awaited<ReturnType<typeof buildContainer>>
