// Runs the main demo story in-process (fake PayPal, heuristic AI, in-memory
// database) and prints the timeline. No accounts needed.
// Usage: npm run demo:flow -w api
import { buildContainer } from '../src/app/container'
import { DEMO } from '../src/features/demo'
import { loadConfig } from '../src/shared'

const container = await buildContainer(loadConfig({ NODE_ENV: 'development', PGLITE_DIR: 'memory://' }))
const { demo, mandates, checkouts, orders, findings, settlement, timeline } = container.services
const say = (who: string, text: string) => console.log(`\n${who.padEnd(9)} ${text}`)

let state = { mandateId: null as string | null, draft: null as any }
const history: Array<{ role: 'user' | 'agent'; text: string }> = []
async function chat(message: string) {
  say('Maya:', message)
  const reply = await demo.chat({ message, history, state })
  history.push({ role: 'user', text: message }, { role: 'agent', text: reply.text })
  state = reply.state
  say('Agent:', reply.text)
  return reply
}

await chat('Get me trail running shoes, size 10, black or grey, under $120, here by Friday')
await chat('Yes, including shipping')
await mandates.approve(state.mandateId!, { userAgent: 'demo-flow' })
say('Maya:', '(approves the mandate on the hosted page)')

const reply = await chat('Go ahead')
for (const card of reply.cards) {
  if (card.type !== 'candidates') continue
  for (const item of card.items) {
    const why = item.checks.filter((c) => c.result !== 'pass' || c.source === 'ai').map((c) => c.reason)
    console.log(`          ${item.outcome.toUpperCase().padEnd(4)} ${item.title} $${item.total}${why.length ? ` - ${why.join('; ')}` : ''}`)
  }
}
const checkoutCard = reply.cards.find((c) => c.type === 'checkout')
if (!checkoutCard || checkoutCard.type !== 'checkout') throw new Error('No checkout')

const { orderId } = await checkouts.createPayPalOrder(checkoutCard.checkoutId)
await demo.fakeApprove(orderId, 'maya')
const paid = await checkouts.capture(checkoutCard.checkoutId)
say('PayPal:', `captured ${paid.captureId}`)

await orders.ship(DEMO.merchantId, paid.id, { carrier: 'USPS', trackingNumber: '9400111', shippedSku: paid.quote.sku })
await orders.markDelivered(DEMO.merchantId, paid.id)
say('Merchant:', `shipped ${paid.quote.sku}`)

say('Maya:', 'These are charcoal, not grey')
const finding = await findings.complain({ checkoutId: paid.id, text: 'These are charcoal, not grey', source: 'hosted' })
say('Sayso:', `${finding.decision.rule} (${finding.decision.fault} at fault). ${finding.explanation}`)
const settled = await settlement.confirm(finding.id, DEMO.merchantId)
say('Merchant:', `confirms -> ${settled.status}. refund ${settled.refundId}, payout ${settled.payoutBatchId}`)

console.log('\nTimeline')
for (const e of await timeline.forSubjects([state.mandateId!, paid.id, finding.id])) {
  console.log(`  ${e.kind.padEnd(24)} ${e.paypalRef ? `[${e.paypalRef}] ` : ''}${e.message}`)
}
await container.close()
