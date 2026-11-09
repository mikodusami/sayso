import { addDays, addMoney, isoDate, multiplyMoney } from '../../shared'
import type { Product, Quote } from '../model'

/** The exact amounts a PayPal order will carry for this product and quantity. */
export function quoteFor(product: Product, quantity: number, now: Date): Quote {
  const itemTotal = multiplyMoney(product.price, quantity)
  const tax = multiplyMoney(product.tax, quantity)
  return {
    merchantId: product.merchantId,
    sku: product.sku,
    quantity,
    unitPrice: product.price,
    itemTotal,
    shipping: product.shipping,
    tax,
    total: addMoney(itemTotal, product.shipping, tax),
    currency: 'USD',
    arrivesBy: isoDate(addDays(now, product.shipsInDays)),
  }
}
