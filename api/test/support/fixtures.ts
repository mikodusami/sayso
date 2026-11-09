// Shared test data: the demo scenario (Maya, Trailhead Running Co., trail shoes).
import {
  buildMandateBody,
  canonicalJson,
  fingerprintOf,
  type Mandate,
  type MandateDraft,
  type Product,
} from '../../src/domain'

export const NOW = new Date('2026-11-10T18:00:00.000Z')

export const draft: MandateDraft = {
  original_text: 'Get me trail running shoes, size 10, black or grey, under $120, here by Friday',
  item: { description: 'trail running shoes', category: 'footwear', quantity: 1 },
  constraints: [
    { field: 'size', kind: 'exact', op: 'eq', values: ['10'] },
    { field: 'colour', kind: 'fuzzy', op: 'one_of', values: ['black', 'grey'] },
  ],
  max_total: '120.00',
  budget_includes_shipping: true,
  deliver_by: '2026-11-13',
}

export function mandate(overrides: Partial<Mandate> = {}): Mandate {
  const body = buildMandateBody({
    id: 'mdt_test',
    shopperId: 'shp_maya',
    agentProviderId: 'ten_agent',
    draft,
    agents: ['agt_reference', 'agt_quickcart'],
    now: NOW,
  })
  const canonical = canonicalJson(body)
  return {
    id: body.id,
    shopperId: 'shp_maya',
    agentProviderId: 'ten_agent',
    body,
    canonical,
    fingerprint: fingerprintOf(canonical),
    status: 'active',
    approval: null,
    usesLeft: 1,
    budgetSpent: '0.00',
    expiresAt: new Date(body.expires_at),
    createdAt: NOW,
    ...overrides,
  }
}

export function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prd_grey10',
    merchantId: 'ten_merchant',
    sku: 'RTR-GRY-10',
    title: 'Ridge Trail Runner',
    category: 'footwear',
    attributes: { size: '10', colour: 'Grey' },
    price: '105.00',
    shipping: '6.00',
    tax: '7.00',
    stock: 5,
    shipsInDays: 2,
    ...overrides,
  }
}
