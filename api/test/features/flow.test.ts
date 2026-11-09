// End-to-end through the HTTP API: fake PayPal, heuristic AI, in-memory PGlite.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildContainer, type Container } from '../../src/app/container'
import { createRecordingNotifier } from '../../src/infrastructure/notifier'
import { fixedClock, loadConfig } from '../../src/shared'

const NOW = new Date('2026-11-10T18:00:00.000Z') // a Tuesday; "by Friday" = 2026-11-13
const clock = fixedClock(NOW)
const { notifier, delivered } = createRecordingNotifier()
let container: Container
let merchant: string // demo session tokens
let provider: string
let keys: { merchantKey: string; agentProviderKey: string }

type Auth = { demo?: string; key?: string; link?: string }

async function call(method: string, path: string, options: { body?: unknown; auth?: Auth; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers }
  if (options.auth?.demo) headers.authorization = `Demo ${options.auth.demo}`
  if (options.auth?.key) headers.authorization = `Bearer ${options.auth.key}`
  const url = options.auth?.link ? `${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(options.auth.link)}` : path
  const res = await container.app.request(url, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  return { status: res.status, headers: res.headers, json: (await res.json()) as any }
}

const linkToken = (url: string) => new URL(url).searchParams.get('t') as string

/** Creates and approves a mandate through the public API with the agent provider's key. */
async function approvedMandate(text: string) {
  const parsed = await call('POST', '/v1/mandates/parse', { auth: { key: keys.agentProviderKey }, body: { text } })
  const created = await call('POST', '/v1/mandates', { auth: { key: keys.agentProviderKey }, body: { shopper_ref: 'maya', draft: parsed.json.draft } })
  expect(created.status).toBe(201)
  const approved = await call('POST', `/v1/hosted/mandates/${created.json.id}/approve`, { auth: { link: linkToken(created.json.approval_url) } })
  expect(approved.json.status).toBe('active')
  return created.json.id as string
}

async function pay(payUrl: string, checkoutId: string, payer: 'maya' | 'other' = 'maya') {
  const link = linkToken(payUrl)
  const order = await call('POST', `/v1/hosted/checkouts/${checkoutId}/paypal-order`, { auth: { link } })
  expect(order.status).toBe(200)
  await call('POST', `/demo/fake-paypal/orders/${order.json.order_id}/approve`, { body: { payer } })
  return call('POST', `/v1/hosted/checkouts/${checkoutId}/capture`, { auth: { link } })
}

beforeAll(async () => {
  container = await buildContainer(loadConfig({ NODE_ENV: 'test', PGLITE_DIR: 'memory://', WEB_ORIGIN: 'http://web.test' }), { clock, notifier })
  keys = (await container.services.demo.seed({ issueKeys: true }))!
  merchant = (await call('POST', '/demo/session', { body: { role: 'merchant' } })).json.token
  provider = (await call('POST', '/demo/session', { body: { role: 'agent_provider' } })).json.token
  await call('POST', '/v1/webhook-endpoints', { auth: { demo: merchant }, body: { url: 'https://merchant.test/hooks' } })
})

afterAll(async () => container.close())

describe('main story: the agent judged "charcoal" as grey (R7)', () => {
  const chat = { history: [] as Array<{ role: 'user' | 'agent'; text: string }>, state: { mandateId: null as string | null, draft: null as unknown } }
  let approvalUrl = ''
  let checkoutId = ''
  let payUrl = ''

  const say = async (message: string) => {
    const res = await call('POST', '/demo/agent/chat', { body: { message, history: chat.history, state: chat.state } })
    expect(res.status).toBe(200)
    chat.history.push({ role: 'user', text: message }, { role: 'agent', text: res.json.text })
    chat.state = res.json.state
    return res.json
  }

  it('asks one clarifying question instead of guessing', async () => {
    const reply = await say('Get me trail running shoes, size 10, black or grey, under $120, here by Friday')
    expect(reply.cards[0]).toEqual({ type: 'questions', questions: ['Is $120.00 your limit including shipping and tax?'] })
  })

  it('creates the mandate after the answer', async () => {
    const reply = await say('Yes, including shipping')
    const card = reply.cards.find((c: any) => c.type === 'mandate')
    expect(card.fingerprint).toMatch(/^sy1\.[0-9a-f]{64}$/)
    expect(card.lines).toContainEqual({ label: 'must match', value: 'size 10 · colour black or grey' })
    expect(card.lines).toContainEqual({ label: 'deliver by', value: '2026-11-13' })
    approvalUrl = card.approvalUrl
  })

  it('will not shop before the shopper approves', async () => {
    const reply = await say('Go ahead')
    expect(reply.text).toMatch(/approve the mandate first/)
  })

  it('shopper approves on the hosted page', async () => {
    const mandateId = chat.state.mandateId as string
    const link = linkToken(approvalUrl)
    expect((await call('GET', `/v1/hosted/mandates/${mandateId}`)).status).toBe(401)
    const view = await call('GET', `/v1/hosted/mandates/${mandateId}`, { auth: { link } })
    expect(view.json.status).toBe('pending_approval')
    expect((await call('POST', `/v1/hosted/mandates/${mandateId}/approve`, { auth: { link } })).json.status).toBe('active')
  })

  it('the guard rejects the wrong ones and picks the AI-judged charcoal pair', async () => {
    const reply = await say('Go ahead')
    const items = reply.cards.find((c: any) => c.type === 'candidates').items
    const outcome = (sku: string) => items.find((i: any) => i.sku === sku).outcome
    expect(outcome('CNY-NVY-10')).toBe('fail') // navy
    expect(outcome('MSA-BLK-10')).toBe('fail') // late
    expect(outcome('RTR-GRY-9')).toBe('fail') // size
    expect(outcome('RTR-GRY-105')).toBe('fail') // size
    expect(outcome('RTR-PRO-GRY-10')).toBe('fail') // $129
    expect(outcome('RTR-GRY-10')).toBe('pass')
    expect(outcome('SUM-CHR-10')).toBe('pass') // judged, cheapest pass
    const pro = items.find((i: any) => i.sku === 'RTR-PRO-GRY-10')
    expect(pro.checks.find((c: any) => c.result === 'fail').reason).toBe('$129.00 total is over your $120.00 limit')

    const checkout = reply.cards.find((c: any) => c.type === 'checkout')
    expect(checkout.status).toBe('ready_for_payment')
    checkoutId = checkout.checkoutId
    payUrl = checkout.payUrl
  })

  it('shopper pays with (fake) PayPal; the order carries the fingerprint', async () => {
    const view = await call('GET', `/v1/hosted/checkouts/${checkoutId}`, { auth: { link: linkToken(payUrl) } })
    expect(view.json.ai_judged_fields).toEqual(['colour'])
    expect(view.json.needs_acceptance).toBe(false)
    expect(view.json.payments.mode).toBe('fake')
    const paid = await pay(payUrl, checkoutId)
    expect(paid.json.status).toBe('paid')
    expect(paid.json.capture_id).toMatch(/^FAKECAPTURE/)
    expect(delivered.some((d) => d.type === 'order.captured')).toBe(true)
  })

  it('merchant sees Asked / Bought and ships it', async () => {
    const detail = await call('GET', `/v1/orders/${checkoutId}`, { auth: { demo: merchant } })
    expect(detail.json.asked.card).toContainEqual({ label: 'must match', value: 'size 10 · colour black or grey' })
    expect(detail.json.bought).toMatchObject({ sku: 'SUM-CHR-10', attributes: { colour: 'Charcoal' }, total: '112.00' })
    const shipped = await call('POST', `/v1/orders/${checkoutId}/shipments`, { auth: { demo: merchant }, body: { carrier: 'USPS', tracking_number: '9400111', shipped_sku: 'SUM-CHR-10' } })
    expect(shipped.status).toBe(201)
    await call('POST', `/v1/orders/${checkoutId}/delivered`, { auth: { demo: merchant } })
  })

  it('shopper complains; the rules find the agent at fault', async () => {
    const res = await call('POST', `/v1/hosted/checkouts/${checkoutId}/complaints`, { auth: { link: linkToken(payUrl) }, body: { text: 'These are charcoal, not grey' } })
    expect(res.status).toBe(201)
    expect(res.json).toMatchObject({ rule: 'R7', fault: 'agent', action: 'refund_and_reimburse', status: 'proposed', amount: '112.00' })
    expect(res.json.explanation).toContain('QuickCart Assistant is responsible')
  })

  it('merchant confirms: refund to the shopper, then the agent provider repays the merchant', async () => {
    const findings = await call('GET', '/v1/findings', { auth: { demo: merchant } })
    const id = findings.json.data[0].id
    const done = await call('POST', `/v1/findings/${id}/confirm`, { auth: { demo: merchant } })
    expect(done.json.status).toBe('done')
    expect(done.json.refund_id).toMatch(/^FAKEREFUND/)
    expect(done.json.payout_batch_id).toMatch(/^FAKEPAYOUT/)
    // Confirming twice cannot move money twice.
    expect((await call('POST', `/v1/findings/${id}/confirm`, { auth: { demo: merchant } })).status).toBe(409)

    const ledger = await call('GET', '/v1/liabilities', { auth: { demo: provider } })
    expect(ledger.json.totals.reimbursed).toBe('112.00')
    expect(delivered.map((d) => d.type)).toEqual(expect.arrayContaining(['finding.created', 'reimbursement.paid']))
  })

  it('the timeline shows every PayPal id', async () => {
    const detail = await call('GET', `/v1/checkouts/${checkoutId}`, { auth: { demo: provider } })
    const kinds = detail.json.timeline.map((e: any) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['mandate.created', 'mandate.approved', 'checkout.created', 'paypal.order_created', 'order.captured', 'order.shipped']))
    expect(detail.json.timeline.find((e: any) => e.kind === 'order.captured').paypal_ref).toMatch(/^FAKECAPTURE/)
  })
})

describe('the merchant verifier and careless agents', () => {
  it('blocks a careless agent in block mode', async () => {
    const mandateId = await approvedMandate('Get me trail running shoes, size 10, grey, under $120 including shipping')
    const res = await call('POST', '/demo/careless-buy', { body: { mandate_id: mandateId, sku: 'RTR-GRY-9' } })
    expect(res.status).toBe(422)
    expect(res.json.error.type).toBe('mandate_violation')
    expect(res.json.error.checks.find((c: any) => c.result === 'fail').reason).toBe('size 9 is not 10')
  })

  it('flags it in flag mode; the shopper must accept the warning to pay (then R5: shopper)', async () => {
    await call('PATCH', '/v1/settings', { auth: { key: keys.merchantKey }, body: { verifier_mode: 'flag' } })
    const mandateId = await approvedMandate('Get me trail running shoes, size 10, grey, under $120 including shipping')
    const res = await call('POST', '/demo/careless-buy', { body: { mandate_id: mandateId, sku: 'RTR-GRY-9' } })
    expect(res.status).toBe(201)
    expect(res.json.flagged).toBe(true)
    const link = linkToken(res.json.pay_url)
    expect((await call('GET', `/v1/hosted/checkouts/${res.json.id}`, { auth: { link } })).json.needs_acceptance).toBe(true)
    expect((await call('POST', `/v1/hosted/checkouts/${res.json.id}/paypal-order`, { auth: { link } })).status).toBe(409)
    await call('POST', `/v1/hosted/checkouts/${res.json.id}/accept`, { auth: { link } })
    expect((await pay(res.json.pay_url, res.json.id)).json.status).toBe('paid')

    const finding = await call('POST', '/v1/complaints', { auth: { key: keys.agentProviderKey }, body: { checkout_id: res.json.id, text: 'Wrong size, these are a 9' } })
    expect(finding.json).toMatchObject({ rule: 'R5', fault: 'shopper', status: 'closed' })
    await call('PATCH', '/v1/settings', { auth: { key: keys.merchantKey }, body: { verifier_mode: 'block' } })
  })
})

describe('money only moves when every check passes', () => {
  async function checkoutFor(sku: string) {
    const mandateId = await approvedMandate('Get me trail running shoes, size 10, grey, under $120 including shipping')
    const res = await call('POST', '/v1/checkouts', { auth: { key: keys.agentProviderKey }, body: { mandate_id: mandateId, agent_id: 'agt_careful', merchant_id: 'ten_trailhead', sku } })
    expect(res.status).toBe(201)
    return { mandateId, checkout: res.json }
  }

  it('refuses to capture when the amount changed after approval', async () => {
    const { mandateId, checkout } = await checkoutFor('RTR-GRY-10')
    const link = linkToken(checkout.pay_url)
    const order = await call('POST', `/v1/hosted/checkouts/${checkout.id}/paypal-order`, { auth: { link } })
    await call('POST', `/demo/fake-paypal/orders/${order.json.order_id}/approve`, { body: { payer: 'maya' } })
    await container.simulator!.tamperAmount(order.json.order_id, '126.00')
    const capture = await call('POST', `/v1/hosted/checkouts/${checkout.id}/capture`, { auth: { link } })
    expect(capture.status).toBe(422)
    expect(capture.json.error.failures).toContain('Amount changed from $118.00 to $126.00')
    const mandate = await call('GET', `/v1/mandates/${mandateId}`, { auth: { key: keys.agentProviderKey } })
    expect(mandate.json).toMatchObject({ status: 'active', uses_left: 1 })
  })

  it('refuses to capture when someone else pays under the mandate', async () => {
    const { checkout } = await checkoutFor('RTR-GRY-10')
    const capture = await pay(checkout.pay_url, checkout.id, 'other')
    expect(capture.status).toBe(422)
    expect(capture.json.error.failures).toContain('The PayPal payer is not the mandate holder')
  })

  it('a used mandate cannot buy again', async () => {
    const { mandateId, checkout } = await checkoutFor('RTR-GRY-10')
    expect((await pay(checkout.pay_url, checkout.id)).json.status).toBe('paid')
    const again = await call('POST', '/v1/checks', { auth: { key: keys.agentProviderKey }, body: { mandate_id: mandateId, agent_id: 'agt_careful', merchant_id: 'ten_trailhead', sku: 'RTR-GRY-10' } })
    expect(again.json.outcome).toBe('fail')
    expect(again.json.checks.find((c: any) => c.name === 'uses').reason).toBe('Mandate has already been used')
  })

  it('merchant shipped the wrong SKU: merchant at fault (R2), refund only', async () => {
    const { checkout } = await checkoutFor('RTR-GRY-10')
    await pay(checkout.pay_url, checkout.id)
    await call('POST', `/v1/orders/${checkout.id}/shipments`, { auth: { key: keys.merchantKey }, body: { carrier: 'USPS', tracking_number: '9400222', shipped_sku: 'RTR-GRY-9' } })
    const finding = await call('POST', '/v1/complaints', { auth: { key: keys.agentProviderKey }, body: { checkout_id: checkout.id, text: 'They sent size 9' } })
    expect(finding.json).toMatchObject({ rule: 'R2', fault: 'merchant' })
    const done = await call('POST', `/v1/findings/${finding.json.id}/confirm`, { auth: { key: keys.merchantKey } })
    expect(done.json).toMatchObject({ status: 'done', payout_batch_id: null })
    expect(done.json.refund_id).toMatch(/^FAKEREFUND/)
  })

  it('changed mind on a correct order: nobody at fault (R9)', async () => {
    const { checkout } = await checkoutFor('RTR-GRY-10')
    await pay(checkout.pay_url, checkout.id)
    await call('POST', `/v1/orders/${checkout.id}/shipments`, { auth: { key: keys.merchantKey }, body: { tracking_number: '9400333', shipped_sku: 'RTR-GRY-10' } })
    await call('POST', `/v1/orders/${checkout.id}/delivered`, { auth: { key: keys.merchantKey } })
    const finding = await call('POST', '/v1/complaints', { auth: { key: keys.agentProviderKey }, body: { checkout_id: checkout.id, text: 'I changed my mind' } })
    expect(finding.json).toMatchObject({ rule: 'R9', fault: 'none', status: 'closed' })
  })
})

describe('API behaviour', () => {
  it('rejects missing keys and the wrong tenant type', async () => {
    expect((await call('GET', '/v1/orders')).status).toBe(401)
    expect((await call('POST', '/v1/mandates/parse', { auth: { key: keys.merchantKey }, body: { text: 'shoes' } })).status).toBe(403)
    expect((await call('GET', '/v1/orders', { auth: { key: 'sk_test_merch_nope' } })).status).toBe(401)
  })

  it('replays idempotent POSTs and rejects a reused key with a different body', async () => {
    const opts = (text: string) => ({ auth: { key: keys.agentProviderKey }, body: { text }, headers: { 'idempotency-key': 'abc-123' } })
    const first = await call('POST', '/v1/mandates/parse', opts('trail shoes under $100'))
    const second = await call('POST', '/v1/mandates/parse', opts('trail shoes under $100'))
    expect(second.headers.get('idempotent-replayed')).toBe('true')
    expect(second.json).toEqual(first.json)
    expect((await call('POST', '/v1/mandates/parse', opts('something else entirely'))).status).toBe(409)
  })

  it('validates bodies with a clear error', async () => {
    const res = await call('POST', '/v1/mandates', { auth: { key: keys.agentProviderKey }, body: { shopper_ref: 'maya' } })
    expect(res.status).toBe(400)
    expect(res.json.error.type).toBe('invalid_request')
  })

  it('de-duplicates PayPal webhooks and turns disputes into findings', async () => {
    const orders = await call('GET', '/v1/orders', { auth: { key: keys.merchantKey } })
    const paid = orders.json.data.find((o: any) => o.status === 'paid' && o.capture_id)
    const event = {
      id: 'WH-TEST-1',
      event_type: 'CUSTOMER.DISPUTE.CREATED',
      resource: { dispute_id: 'PP-D-1', reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', disputed_transactions: [{ seller_transaction_id: paid.capture_id }] },
    }
    const first = await call('POST', '/v1/paypal/webhooks/ten_trailhead', { body: event })
    expect(first.json).toEqual({ handled: true, duplicate: false })
    expect((await call('POST', '/v1/paypal/webhooks/ten_trailhead', { body: event })).json.duplicate).toBe(true)
    const findings = await call('GET', '/v1/findings', { auth: { key: keys.merchantKey } })
    expect(findings.json.data.some((f: any) => f.checkout_id === paid.id && f.facts.type === 'not_received')).toBe(true)
  })

  it('serves an index and health', async () => {
    expect((await call('GET', '/v1')).json.name).toBe('Sayso API')
    expect((await call('GET', '/health')).json).toMatchObject({ ok: true, payments: 'fake', ai: 'heuristic' })
  })
})
