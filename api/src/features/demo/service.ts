import { describeMandate, type Tenant } from '../../domain'
import { AppError, addMoney, newApiKeySecret, newId, type Clock } from '../../shared'
import type {
  AgentState,
  KeyHasher,
  PaymentsProvider,
  PaymentsSimulator,
  ProductCandidate,
  Repositories,
  SecretBox,
  ShoppingAgent,
  ShoppingToolbox,
  TokenSigner,
} from '../../ports'
import type { CatalogService } from '../catalog'
import type { ChecksService } from '../checks'
import type { CheckoutService } from '../checkouts'
import type { MandateService } from '../mandates'
import { DEMO, DEMO_MERCHANT_SETTINGS, DEMO_PRODUCTS } from './seed-data'

export interface DemoDeps {
  repos: Repositories
  catalog: CatalogService
  mandates: MandateService
  checks: ChecksService
  checkouts: CheckoutService
  agent: ShoppingAgent
  payments: PaymentsProvider
  simulator: PaymentsSimulator | null
  tokens: TokenSigner
  hasher: KeyHasher
  secretBox: SecretBox
  clock: Clock
  aiName: string
  seedPayPal: {
    merchant: { clientId?: string; secret?: string; webhookId?: string; email?: string }
    agentProvider: { clientId?: string; secret?: string; webhookId?: string }
  }
}

export const DEMO_SESSION_TTL_SECONDS = 2 * 60 * 60

export function createDemoService(deps: DemoDeps) {
  const { repos, catalog, mandates, checks, checkouts, agent, payments, simulator, tokens, hasher, secretBox, clock } = deps

  const paypalAccount = (creds: { clientId?: string; secret?: string; webhookId?: string; email?: string }) =>
    creds.clientId && creds.secret
      ? { clientId: creds.clientId, secretEnc: secretBox.encrypt(creds.secret), webhookId: creds.webhookId ?? null, email: creds.email ?? null }
      : null

  async function upsertTenant(tenant: Omit<Tenant, 'createdAt'>) {
    const existing = await repos.tenants.get(tenant.id)
    if (existing) return repos.tenants.update(tenant.id, { name: tenant.name, paypal: tenant.paypal ?? existing.paypal })
    return repos.tenants.create({ ...tenant, createdAt: clock.now() })
  }

  async function issueKey(tenantId: string, scope: 'merch' | 'agent') {
    const secret = newApiKeySecret(scope)
    await repos.apiKeys.create({ id: newId('apiKey'), tenantId, prefix: secret.slice(0, 16), hash: hasher.hash(secret), createdAt: clock.now(), revokedAt: null })
    return secret
  }

  /** Toolbox the reference agent uses: the same calls an agent provider makes against /v1. */
  function toolbox(): ShoppingToolbox {
    return {
      parseRequest: (text) => mandates.parse(text),
      async createMandate(draft) {
        const { mandate, approvalUrl } = await mandates.create({
          agentProviderId: DEMO.agentProviderId,
          shopperRef: DEMO.shopperRef,
          shopperName: DEMO.shopperName,
          draft,
          agents: [DEMO.carefulAgentId, DEMO.carelessAgentId],
        })
        return { mandateId: mandate.id, approvalUrl, fingerprint: mandate.fingerprint, lines: describeMandate(mandate.body) }
      },
      async mandateStatus(id) {
        const m = await mandates.get(id)
        return { status: m.status, item: m.body.item.description }
      },
      async searchProducts(query) {
        const results = await catalog.search(query, { limit: 10 })
        return results.map(({ product, merchantName }): ProductCandidate => ({
          merchantId: product.merchantId,
          merchantName,
          sku: product.sku,
          title: product.title,
          attributes: product.attributes,
          total: addMoney(product.price, product.shipping, product.tax),
        }))
      },
      async checkCandidate(mandateId, candidate) {
        const result = await checks.check({
          agentProviderId: DEMO.agentProviderId,
          agentId: DEMO.carefulAgentId,
          mandateId,
          merchantId: candidate.merchantId,
          sku: candidate.sku,
        })
        return { sku: candidate.sku, title: `${candidate.title} (${Object.values(candidate.attributes).join(', ')})`, total: result.quote.total, outcome: result.summary.outcome, checks: result.checks }
      },
      async createCheckout(mandateId, candidate) {
        const { checkout, payUrl } = await checkouts.create({
          agentProviderId: DEMO.agentProviderId,
          agentId: DEMO.carefulAgentId,
          mandateId,
          merchantId: candidate.merchantId,
          sku: candidate.sku,
        })
        return { checkoutId: checkout.id, status: checkout.status, payUrl, checks: checkout.checks }
      },
    }
  }

  return {
    /** Creates or refreshes the demo tenants, agents and catalog. Returns new API keys when asked. */
    async seed(options: { issueKeys?: boolean } = {}) {
      await upsertTenant({
        id: DEMO.merchantId,
        type: 'merchant',
        name: DEMO.merchantName,
        paypal: paypalAccount(deps.seedPayPal.merchant),
        settings: DEMO_MERCHANT_SETTINGS,
      })
      await upsertTenant({
        id: DEMO.agentProviderId,
        type: 'agent_provider',
        name: DEMO.agentProviderName,
        paypal: paypalAccount(deps.seedPayPal.agentProvider),
        settings: DEMO_MERCHANT_SETTINGS,
      })
      await repos.agents.upsert({ id: DEMO.carefulAgentId, tenantId: DEMO.agentProviderId, name: DEMO.carefulAgentName, runsGuard: true })
      await repos.agents.upsert({ id: DEMO.carelessAgentId, tenantId: DEMO.agentProviderId, name: DEMO.carelessAgentName, runsGuard: false })
      for (const [sku, product] of Object.entries(DEMO_PRODUCTS)) await catalog.upsert(DEMO.merchantId, sku, product)

      if (!options.issueKeys) return null
      return { merchantKey: await issueKey(DEMO.merchantId, 'merch'), agentProviderKey: await issueKey(DEMO.agentProviderId, 'agent') }
    },

    async reset() {
      await repos.wipe()
      await this.seed()
    },

    session(role: 'merchant' | 'agent_provider') {
      const tenantId = role === 'merchant' ? DEMO.merchantId : DEMO.agentProviderId
      return { token: tokens.sign({ action: 'demo_session', subject: tenantId }, DEMO_SESSION_TTL_SECONDS), tenantId }
    },

    async state() {
      const merchant = await repos.tenants.get(DEMO.merchantId)
      if (!merchant) throw new AppError('conflict', 'Demo is not seeded. POST /demo/reset first.')
      return {
        merchant: { id: merchant.id, name: merchant.name, settings: merchant.settings, paypal_configured: merchant.paypal !== null },
        agent_provider: { id: DEMO.agentProviderId, name: DEMO.agentProviderName },
        agents: await repos.agents.listForTenant(DEMO.agentProviderId),
        shopper: { ref: DEMO.shopperRef, name: DEMO.shopperName },
        drivers: { payments: payments.mode, ai: deps.aiName, agent: agent.name },
        products: (await catalog.search('', { merchantIds: [DEMO.merchantId], limit: 50 })).map(({ product }) => ({
          sku: product.sku,
          title: product.title,
          attributes: product.attributes,
          total: addMoney(product.price, product.shipping, product.tax),
        })),
      }
    },

    /** One turn with the reference agent (QuickCart Assistant, which runs the guard). */
    async chat(input: { message: string; history: Array<{ role: 'user' | 'agent'; text: string }>; state: AgentState }) {
      return agent.respond({ message: input.message, history: input.history, state: input.state, toolbox: toolbox() })
    },

    /** QuickCart Turbo skips the guard and goes straight to the merchant. The merchant verifier still checks it. */
    async carelessBuy(input: { mandateId: string; sku: string }) {
      return checkouts.create({
        agentProviderId: DEMO.agentProviderId,
        agentId: DEMO.carelessAgentId,
        mandateId: input.mandateId,
        merchantId: DEMO.merchantId,
        sku: input.sku,
      })
    },

    /** Fake PayPal only: stands in for the buyer approving in the PayPal popup. */
    async fakeApprove(orderId: string, payer: keyof typeof DEMO.fakePayers) {
      if (!simulator) throw new AppError('forbidden', 'Fake approval only exists when PAYMENTS_DRIVER=fake')
      await simulator.approveOrder(orderId, DEMO.fakePayers[payer])
    },
  }
}

export type DemoService = ReturnType<typeof createDemoService>
