// Creates (or refreshes) the demo tenants, agents and catalog, and prints a
// fresh API key for each tenant. Keys are only shown here, once.
// Usage: npm run seed -w api
import { buildContainer } from '../src/app/container'
import { DEMO } from '../src/features/demo'
import { loadConfig } from '../src/shared'

const config = loadConfig()
const container = await buildContainer(config, { autoSeed: false })
const keys = await container.services.demo.seed({ issueKeys: true })
await container.close()

console.log(`
Seeded demo tenants (${config.database.driver}, payments=${config.payments.driver}).

  Merchant        ${DEMO.merchantName}   id ${DEMO.merchantId}
    API key       ${keys?.merchantKey}
    PayPal webhook URL to register on the merchant REST app:
                  ${config.publicApiUrl}/v1/paypal/webhooks/${DEMO.merchantId}

  Agent provider  ${DEMO.agentProviderName}   id ${DEMO.agentProviderId}
    API key       ${keys?.agentProviderKey}
    PayPal webhook URL to register on the agent-provider REST app:
                  ${config.publicApiUrl}/v1/paypal/webhooks/${DEMO.agentProviderId}

  Agents          ${DEMO.carefulAgentId} (${DEMO.carefulAgentName}, runs the guard)
                  ${DEMO.carelessAgentId} (${DEMO.carelessAgentName}, skips the guard)
`)
