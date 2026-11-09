import { describe, expect, it } from 'vitest'
import { classifyHeuristically, judgeHeuristically, parseRequestHeuristically } from '../../src/infrastructure/ai'
import { createSecretBox, createTokenSigner } from '../../src/infrastructure/crypto'
import { createFakePayments } from '../../src/infrastructure/paypal'
import { reviewDraft, type Tenant } from '../../src/domain'

describe('heuristic AI', () => {
  it('parses the demo request', () => {
    const draft = parseRequestHeuristically('Get me trail running shoes, size 10, black or grey, under $120, here by Friday', '2026-11-10')
    expect(draft.item.description).toBe('trail running shoes')
    expect(draft.item.category).toBe('footwear')
    expect(draft.constraints).toEqual([
      { field: 'size', kind: 'exact', op: 'eq', values: ['10'] },
      { field: 'colour', kind: 'fuzzy', op: 'one_of', values: ['black', 'grey'] },
    ])
    expect(draft.max_total).toBe('120.00')
    expect(draft.deliver_by).toBe('2026-11-13')
    // Shipping wasn't mentioned, so it asks instead of guessing.
    expect(reviewDraft(draft).questions).toEqual(['Is $120.00 your limit including shipping and tax?'])
  })

  it('reads "including shipping"', () => {
    expect(parseRequestHeuristically('trail shoes under $120 including shipping', '2026-11-10').budget_includes_shipping).toBe(true)
  })

  it('judges colour families', () => {
    expect(judgeHeuristically({ field: 'colour', allowed: ['black', 'grey'], productValue: 'Charcoal / Volt' }).verdict).toBe('match')
    expect(judgeHeuristically({ field: 'colour', allowed: ['black', 'grey'], productValue: 'Navy' }).verdict).toBe('no_match')
    expect(judgeHeuristically({ field: 'colour', allowed: ['black', 'grey'], productValue: 'Aurora' }).verdict).toBe('unsure')
  })

  it('sorts complaints', () => {
    const ctx = { item: 'shoes', constraints: [{ field: 'size', values: ['10'] }, { field: 'colour', values: ['black', 'grey'] }], attributes: {} }
    expect(classifyHeuristically({ ...ctx, text: 'These are a size 9' })).toMatchObject({ type: 'wrong_detail', contestedFields: ['size'] })
    expect(classifyHeuristically({ ...ctx, text: 'I changed my mind' }).type).toBe('changed_mind')
    expect(classifyHeuristically({ ...ctx, text: "I didn't buy this" }).type).toBe('did_not_buy')
    expect(classifyHeuristically({ ...ctx, text: 'That charcoal is not grey' }).contestedFields).toEqual(['colour'])
  })
})

describe('crypto', () => {
  it('round-trips secrets', () => {
    const box = createSecretBox(Buffer.alloc(32, 1).toString('base64'))
    const sealed = box.encrypt('client-secret')
    expect(sealed).not.toContain('client-secret')
    expect(box.decrypt(sealed)).toBe('client-secret')
  })
  it('rejects tampered and expired tokens', () => {
    let now = new Date('2026-11-10T00:00:00Z')
    const signer = createTokenSigner('s', () => now)
    const token = signer.sign({ action: 'approve_mandate', subject: 'mdt_1' }, 60)
    expect(signer.verify(token)?.subject).toBe('mdt_1')
    expect(signer.verify(token.slice(0, -2) + 'xx')).toBeNull()
    now = new Date('2026-11-10T00:02:00Z')
    expect(signer.verify(token)).toBeNull()
  })
})

describe('fake PayPal', () => {
  const tenant = { id: 'ten_m' } as Tenant
  it('follows CREATED -> APPROVED -> COMPLETED and is idempotent', async () => {
    const fake = createFakePayments()
    const gw = fake.forTenant(tenant)
    const input = { requestId: 'create-1', referenceId: 'chk', customId: 'sy1.x', invoiceId: 'inv', description: 'd', currency: 'USD' as const, itemTotal: '1.00', shipping: '0.00', taxTotal: '0.00', total: '1.00', items: [] }
    const order = await gw.createOrder(input)
    expect((await gw.createOrder(input)).orderId).toBe(order.orderId)
    await expect(gw.captureOrder(order.orderId, 'cap-1')).rejects.toThrow(/CREATED/)
    await fake.approveOrder(order.orderId, 'PAYER1')
    const capture = await gw.captureOrder(order.orderId, 'cap-1')
    expect(capture.status).toBe('COMPLETED')
    const refund = await gw.refundCapture({ requestId: 'r-1', captureId: capture.captureId, amount: '1.00', currency: 'USD', noteToPayer: '' })
    expect((await gw.refundCapture({ requestId: 'r-1', captureId: capture.captureId, amount: '1.00', currency: 'USD', noteToPayer: '' })).refundId).toBe(refund.refundId)
  })
})
