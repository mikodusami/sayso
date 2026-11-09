import type { MerchantSettings } from '../../domain'
import type { ProductInput } from '../catalog'

// Fictional demo businesses. Chosen so one run shows every guard outcome.

export const DEMO = {
  merchantId: 'ten_trailhead',
  merchantName: 'Trailhead Running Co.',
  agentProviderId: 'ten_quickcart',
  agentProviderName: 'QuickCart',
  carefulAgentId: 'agt_careful',
  carefulAgentName: 'QuickCart Assistant',
  carelessAgentId: 'agt_careless',
  carelessAgentName: 'QuickCart Turbo',
  shopperRef: 'maya',
  shopperName: 'Maya',
  fakePayers: { maya: 'FAKEPAYER-MAYA', other: 'FAKEPAYER-OTHER' },
} as const

export const DEMO_MERCHANT_SETTINGS: MerchantSettings = {
  verifierMode: 'block',
  autoRefundLimit: '0.00',
  returnPolicy: 'Unworn shoes can be returned within 30 days.',
}

const shoe = (title: string, size: string, colour: string, price: string, shipsInDays = 2): ProductInput => ({
  title,
  category: 'footwear',
  attributes: { size, colour },
  price,
  shipping: '6.00',
  tax: '7.00',
  stock: 5,
  shipsInDays,
})

/** Totals include $6.00 shipping and $7.00 tax. */
export const DEMO_PRODUCTS: Record<string, ProductInput> = {
  'CNY-NVY-10': shoe('Canyon Trail Runner', '10', 'Navy', '95.00'), //         $108 - wrong colour (AI: navy is blue)
  'SUM-CHR-10': shoe('Summit Trail Runner', '10', 'Charcoal', '99.00'), //     $112 - AI judges charcoal as grey
  'MSA-BLK-10': shoe('Mesa Trail Runner', '10', 'Black', '104.00', 6), //     $117 - arrives too late
  'RTR-GRY-10': shoe('Ridge Trail Runner', '10', 'Grey', '105.00'), //        $118 - matches everything
  'RTR-GRY-9': shoe('Ridge Trail Runner', '9', 'Grey', '105.00'), //          $118 - wrong size
  'RTR-GRY-105': shoe('Ridge Trail Runner', '10.5', 'Grey', '105.00'), //     $118 - wrong size
  'RTR-PRO-GRY-10': shoe('Ridge Trail Runner Pro', '10', 'Grey', '116.00'), // $129 - over budget
}
