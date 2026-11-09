import { describe, expect, it } from 'vitest'
import {
  buildMandateBody,
  canonicalJson,
  describeMandate,
  fingerprintOf,
  reviewDraft,
  verifyFingerprint,
} from '../../src/domain'
import { NOW, draft, mandate } from '../support/fixtures'

describe('mandate drafts', () => {
  it('asks instead of guessing when the budget is missing', () => {
    const review = reviewDraft({ ...draft, max_total: null, budget_includes_shipping: null })
    expect(review.complete).toBe(false)
    expect(review.questions).toContain('What is the most you want to spend?')
  })

  it('asks whether the limit includes shipping', () => {
    const review = reviewDraft({ ...draft, budget_includes_shipping: null })
    expect(review.questions[0]).toMatch(/including shipping/)
  })

  it('refuses to build an incomplete mandate', () => {
    expect(() =>
      buildMandateBody({ id: 'mdt_x', shopperId: 's', agentProviderId: 'a', draft: { ...draft, max_total: null }, agents: ['agt'], now: NOW }),
    ).toThrow(/incomplete/)
  })

  it('defaults to one use and a 72 hour expiry', () => {
    const m = mandate()
    expect(m.body.uses).toBe(1)
    expect(new Date(m.body.expires_at).getTime() - NOW.getTime()).toBe(72 * 3_600_000)
  })

  it('describes itself in plain language', () => {
    const lines = describeMandate(mandate().body)
    expect(lines.find((l) => l.label === 'must match')?.value).toBe('size 10 · colour black or grey')
    expect(lines.find((l) => l.label === 'max total')?.value).toBe('$120.00 USD including shipping and tax')
  })
})

describe('fingerprints', () => {
  it('is 68 characters and fits PayPal custom_id (127)', () => {
    expect(mandate().fingerprint).toMatch(/^sy1\.[0-9a-f]{64}$/)
  })

  it('is the same for the same content in any key order', () => {
    const body = mandate().body
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(body).reverse())))
    expect(fingerprintOf(canonicalJson(reordered))).toBe(fingerprintOf(canonicalJson(body)))
  })

  it('changes when anything changes', () => {
    const body = mandate().body
    const changed = { ...body, budget: { ...body.budget, max_total: '121.00' } }
    expect(fingerprintOf(canonicalJson(changed))).not.toBe(fingerprintOf(canonicalJson(body)))
  })

  it('detects tampering with stored text', () => {
    const m = mandate()
    expect(verifyFingerprint(m.canonical, m.fingerprint)).toBe(true)
    expect(verifyFingerprint(m.canonical.replace('120.00', '999.00'), m.fingerprint)).toBe(false)
  })
})
