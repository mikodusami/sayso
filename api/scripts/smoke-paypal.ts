// Day-one check against the real PayPal sandbox, using the SEED_* credentials.
//
//   npm run smoke -w api                    tokens, a $1 order, a $1 payout, MCP tools
//   npm run smoke -w api -- capture <id>    after approving that order in the browser:
//                                           capture it, then refund it
import { createRestGateway, openPayPalReadTools, PayPalRestClient } from '../src/infrastructure/paypal'
import { loadConfig } from '../src/shared'

const config = loadConfig()
const { merchant, agentProvider } = config.seed
const need = (value: string | undefined, name: string) => {
  if (!value) {
    console.error(`Missing ${name} in api/.env - see SETUP.md`)
    process.exit(1)
  }
  return value
}

const merchantClient = new PayPalRestClient(config.payments.apiBase, {
  clientId: need(merchant.clientId, 'SEED_MERCHANT_PAYPAL_CLIENT_ID'),
  secret: need(merchant.secret, 'SEED_MERCHANT_PAYPAL_SECRET'),
})
const merchantPayPal = createRestGateway(merchantClient)
const ok = (label: string, value: unknown) => console.log(`  ✓ ${label}: ${value}`)
const bad = (label: string, error: unknown) => console.log(`  ✗ ${label}: ${(error as Error).message}`)

const [command, orderId] = process.argv.slice(2)

if (command === 'capture') {
  const id = need(orderId, 'an order id')
  const capture = await merchantPayPal.captureOrder(id, `smoke-capture-${id}`)
  ok('captured', `${capture.captureId} (${capture.status}) payer ${capture.payerId}`)
  const refund = await merchantPayPal.refundCapture({ requestId: `smoke-refund-${id}`, captureId: capture.captureId, amount: '1.00', currency: 'USD', noteToPayer: 'Sayso smoke test' })
  ok('refunded', `${refund.refundId} (${refund.status})`)
  process.exit(0)
}

console.log('PayPal sandbox smoke test')
try {
  ok('merchant token', `${(await merchantClient.token()).slice(0, 12)}…`)
} catch (e) {
  bad('merchant token', e)
  process.exit(1)
}

try {
  const order = await merchantPayPal.createOrder({
    requestId: `smoke-${Date.now()}`,
    referenceId: 'smoke',
    customId: 'sy1.smoke',
    invoiceId: `SAYSO-SMOKE-${Date.now()}`,
    description: 'Sayso smoke test',
    currency: 'USD',
    itemTotal: '1.00',
    shipping: '0.00',
    taxTotal: '0.00',
    total: '1.00',
    items: [{ name: 'Smoke test', sku: 'SMOKE', quantity: 1, unitAmount: '1.00', tax: '0.00' }],
  })
  ok('order created', order.orderId)
  console.log(`    Approve it as the sandbox buyer: https://www.sandbox.paypal.com/checkoutnow?token=${order.orderId}`)
  console.log(`    Then run: npm run smoke -w api -- capture ${order.orderId}`)
} catch (e) {
  bad('order', e)
}

if (agentProvider.clientId && agentProvider.secret) {
  try {
    const providerPayPal = createRestGateway(new PayPalRestClient(config.payments.apiBase, { clientId: agentProvider.clientId, secret: agentProvider.secret }))
    const payout = await providerPayPal.createPayout({
      batchId: `smoke-${Date.now()}`,
      itemId: 'smoke',
      receiverEmail: need(merchant.email, 'SEED_MERCHANT_PAYPAL_EMAIL'),
      amount: '1.00',
      currency: 'USD',
      subject: 'Sayso smoke test',
      note: 'Payout permission check',
    })
    ok('payout from agent provider to merchant', `${payout.payoutBatchId} (${payout.status})`)
  } catch (e) {
    bad('payout (enable Payouts on the agent-provider app, or use the invoice fallback)', e)
  }
} else {
  console.log('  - payout skipped: SEED_AGENT_PAYPAL_CLIENT_ID / SECRET not set')
}

try {
  const mcp = await openPayPalReadTools(config.payments.mcpUrl, await merchantClient.token())
  ok('PayPal MCP tools', `${mcp.toolNames.length} available; read-only allowlist matched ${Object.keys(mcp.tools).length}: ${Object.keys(mcp.tools).join(', ')}`)
  await mcp.close()
} catch (e) {
  bad('PayPal MCP (optional; P1 feature)', e)
}
