// The real PayPal adapter, with fetch replaced: checks the exact requests Sayso sends.
import { describe, expect, it } from 'vitest'
import { createRestGateway, PayPalRestClient } from '../../src/infrastructure/paypal'

function recordingFetch(responses: Record<string, unknown>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: any }> = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>
    calls.push({ url, method: init.method ?? 'GET', headers, body: typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body })
    const path = new URL(url).pathname
    const key = Object.keys(responses).find((k) => path.endsWith(k)) ?? ''
    return new Response(JSON.stringify(responses[key] ?? {}), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

describe('PayPal REST adapter', () => {
  it('logs in once, then sends orders with the fingerprint, breakdown and idempotency key', async () => {
    const { calls, fetchImpl } = recordingFetch({
      '/v1/oauth2/token': { access_token: 'TOKEN', expires_in: 3600 },
      '/v2/checkout/orders': { id: 'ORDER1', status: 'CREATED' },
    })
    const gw = createRestGateway(new PayPalRestClient('https://api-m.sandbox.paypal.com', { clientId: 'cid-orders', secret: 's' }, fetchImpl))
    const order = await gw.createOrder({
      requestId: 'create-chk_1', referenceId: 'chk_1', customId: 'sy1.abc', invoiceId: 'SAYSO-chk_1', description: 'Ridge Trail Runner',
      currency: 'USD', itemTotal: '105.00', shipping: '6.00', taxTotal: '7.00', total: '118.00',
      items: [{ name: 'Ridge Trail Runner', sku: 'RTR-GRY-10', quantity: 1, unitAmount: '105.00', tax: '7.00' }],
    })
    expect(order).toEqual({ orderId: 'ORDER1', status: 'CREATED' })
    const [login, create] = calls
    expect(login!.headers.Authorization).toBe(`Basic ${Buffer.from('cid-orders:s').toString('base64')}`)
    expect(login!.body).toBe('grant_type=client_credentials')
    expect(create!.headers.Authorization).toBe('Bearer TOKEN')
    expect(create!.headers['PayPal-Request-Id']).toBe('create-chk_1')
    const unit = create!.body.purchase_units[0]
    expect(unit.custom_id).toBe('sy1.abc')
    expect(unit.amount).toEqual({ currency_code: 'USD', value: '118.00', breakdown: { item_total: { currency_code: 'USD', value: '105.00' }, shipping: { currency_code: 'USD', value: '6.00' }, tax_total: { currency_code: 'USD', value: '7.00' } } })
    expect(unit.items[0]).toMatchObject({ sku: 'RTR-GRY-10', quantity: '1', category: 'PHYSICAL_GOODS' })

    await gw.createOrder({ requestId: 'create-chk_2', referenceId: 'chk_2', customId: 'x', invoiceId: 'i', description: 'd', currency: 'USD', itemTotal: '1.00', shipping: '0.00', taxTotal: '0.00', total: '1.00', items: [] })
    expect(calls.filter((c) => c.url.endsWith('/v1/oauth2/token'))).toHaveLength(1) // token cached
  })

  it('reads captures, refunds, payouts and webhook verification correctly', async () => {
    const { calls, fetchImpl } = recordingFetch({
      '/v1/oauth2/token': { access_token: 'T2', expires_in: 3600 },
      '/capture': { id: 'ORDER1', status: 'COMPLETED', payer: { payer_id: 'PAYER' }, purchase_units: [{ payments: { captures: [{ id: 'CAP1', status: 'COMPLETED' }] } }] },
      '/refund': { id: 'REF1', status: 'COMPLETED' },
      '/v1/payments/payouts': { batch_header: { payout_batch_id: 'BATCH1', batch_status: 'PENDING' } },
      '/verify-webhook-signature': { verification_status: 'SUCCESS' },
    })
    const gw = createRestGateway(new PayPalRestClient('https://api-m.sandbox.paypal.com', { clientId: 'cid-money', secret: 's' }, fetchImpl))
    expect(await gw.captureOrder('ORDER1', 'capture-chk_1')).toEqual({ captureId: 'CAP1', status: 'COMPLETED', payerId: 'PAYER' })
    expect(await gw.refundCapture({ requestId: 'refund-fnd_1', captureId: 'CAP1', amount: '112.00', currency: 'USD', noteToPayer: 'n' })).toEqual({ refundId: 'REF1', status: 'COMPLETED' })
    expect(calls.find((c) => c.url.endsWith('/v2/payments/captures/CAP1/refund'))!.headers['PayPal-Request-Id']).toBe('refund-fnd_1')
    const payout = await gw.createPayout({ batchId: 'reimb-fnd_1', itemId: 'fnd_1', receiverEmail: 'm@example.com', amount: '112.00', currency: 'USD', subject: 's', note: 'n' })
    expect(payout).toEqual({ payoutBatchId: 'BATCH1', status: 'PENDING' })
    const body = calls.find((c) => c.url.endsWith('/v1/payments/payouts'))!.body
    expect(body.sender_batch_header.sender_batch_id).toBe('reimb-fnd_1')
    expect(body.items[0]).toMatchObject({ amount: { value: '112.00', currency: 'USD' }, receiver: 'm@example.com' })
    expect(await gw.verifyWebhook({ webhookId: 'WH', headers: { 'paypal-auth-algo': 'SHA256withRSA' }, event: { id: 'E' } })).toBe(true)
  })

  it('turns PayPal errors into paypal_error with the debug id', async () => {
    const fetchImpl = (async (url: string) =>
      url.endsWith('/v1/oauth2/token')
        ? new Response(JSON.stringify({ access_token: 'T3', expires_in: 3600 }))
        : new Response(JSON.stringify({ name: 'UNPROCESSABLE_ENTITY', debug_id: 'DBG1', details: [{ issue: 'ORDER_NOT_APPROVED' }] }), { status: 422 })) as unknown as typeof fetch
    const gw = createRestGateway(new PayPalRestClient('https://api-m.sandbox.paypal.com', { clientId: 'cid-err', secret: 's' }, fetchImpl))
    await expect(gw.captureOrder('ORDER1', 'r')).rejects.toMatchObject({ type: 'paypal_error', details: { status: 422, debugId: 'DBG1' } })
  })
})
