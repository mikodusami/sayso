import { describe, expect, it } from 'vitest'
import { finaliseChecks, normaliseValue, planChecks, quoteFor, resolveFuzzy, summariseChecks } from '../../src/domain'
import { NOW, mandate, product } from '../support/fixtures'

const plan = (p = product(), m = mandate(), agentId = 'agt_reference') =>
  planChecks({ mandate: m, product: p, quote: quoteFor(p, 1, NOW), agentId, now: NOW })

const outcome = (p = product(), m = mandate(), agentId = 'agt_reference') => {
  const result = plan(p, m, agentId)
  return summariseChecks(result.results).outcome
}

describe('normalising values', () => {
  it.each([
    ['US 10', '10'],
    ['10.0', '10'],
    ["Men's 10", '10'],
    ['Gray', 'grey'],
    ['  BLACK ', 'black'],
    ['10.5', '10.5'],
  ])('%s -> %s', (input, expected) => expect(normaliseValue(input)).toBe(expected))
})

describe('hard checks (code only)', () => {
  it('passes the right grey size 10 at $118.00', () => {
    expect(quoteFor(product(), 1, NOW).total).toBe('118.00')
    expect(outcome()).toBe('pass')
  })

  it('fails a $129 pair with a plain reason', () => {
    const p = product({ sku: 'RTR-GRY-10-PRO', price: '116.00' })
    const failures = summariseChecks(plan(p).results).failures
    expect(failures.map((f) => f.reason)).toContain('$129.00 total is over your $120.00 limit')
  })

  it('fails the wrong size even if everything else is fine', () => {
    expect(outcome(product({ attributes: { size: '10.5', colour: 'Grey' } }))).toBe('fail')
    expect(outcome(product({ attributes: { size: '9', colour: 'Grey' } }))).toBe('fail')
  })

  it('accepts "US 10" as size 10', () => {
    expect(outcome(product({ attributes: { size: 'US 10', colour: 'grey' } }))).toBe('pass')
  })

  it('fails an agent the mandate does not allow', () => {
    expect(outcome(product(), mandate(), 'agt_stranger')).toBe('fail')
  })

  it('fails expired, used and revoked mandates', () => {
    expect(outcome(product(), mandate({ expiresAt: new Date(NOW.getTime() - 1) }))).toBe('fail')
    expect(outcome(product(), mandate({ usesLeft: 0 }))).toBe('fail')
    expect(outcome(product(), mandate({ status: 'revoked' }))).toBe('fail')
  })

  it('fails a tampered mandate', () => {
    const m = mandate()
    expect(outcome(product(), { ...m, canonical: m.canonical.replace('120.00', '999.00') })).toBe('fail')
  })

  it('fails late delivery', () => {
    expect(outcome(product({ shipsInDays: 7 }))).toBe('fail')
  })

  it('counts budget already spent', () => {
    expect(outcome(product(), mandate({ budgetSpent: '10.00' }))).toBe('fail')
  })
})

describe('fuzzy constraints', () => {
  it('sends unclear colours to a judgement instead of deciding', () => {
    const result = plan(product({ attributes: { size: '10', colour: 'Charcoal' } }))
    expect(result.pending).toEqual([{ field: 'colour', allowed: ['black', 'grey'], productValue: 'Charcoal' }])
  })

  it('records an AI pass as an AI judgement (rule R7 needs this)', () => {
    const result = plan(product({ attributes: { size: '10', colour: 'Charcoal' } }))
    const checks = finaliseChecks(result, [{ verdict: 'match', confidence: 0.9, reason: 'charcoal is a dark grey' }])
    const summary = summariseChecks(checks)
    expect(summary.outcome).toBe('pass')
    expect(summary.aiJudgedFields).toEqual(['colour'])
  })

  it('asks the shopper when the AI is unsure or not confident', () => {
    const q = { field: 'colour', allowed: ['black', 'grey'], productValue: 'Slate' }
    expect(resolveFuzzy(q, { verdict: 'unsure', confidence: 0.9, reason: '' }).result).toBe('ask')
    expect(resolveFuzzy(q, { verdict: 'match', confidence: 0.6, reason: '' }).result).toBe('ask')
  })

  it('fails a confident no-match', () => {
    const q = { field: 'colour', allowed: ['black', 'grey'], productValue: 'Navy' }
    expect(resolveFuzzy(q, { verdict: 'no_match', confidence: 0.95, reason: 'navy is blue' }).result).toBe('fail')
  })
})
