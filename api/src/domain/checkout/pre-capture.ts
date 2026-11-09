import { compareMoney } from '../../shared'
import { verifyFingerprint } from '../mandate/fingerprint'
import type { Checkout, Mandate } from '../model'

/** What Sayso reads back from PayPal right before capturing. */
export interface OrderSnapshot {
  status: string
  amount: string
  currency: string
  customId: string | null
  payerId: string | null
}

export interface PreCaptureResult {
  ok: boolean
  failures: string[]
  /** Set when this is the shopper's first payment: bind this PayPal payer to them. */
  bindPayerId: string | null
}

/**
 * The second check. Prices, payers and mandates can change between the guard
 * and the payment, so verify the PayPal order itself before taking money.
 */
export function verifyBeforeCapture(input: {
  checkout: Pick<Checkout, 'quote' | 'status'>
  mandate: Pick<Mandate, 'status' | 'usesLeft' | 'expiresAt' | 'fingerprint' | 'canonical'>
  order: OrderSnapshot
  boundPayerId: string | null
  now: Date
}): PreCaptureResult {
  const { checkout, mandate, order, boundPayerId, now } = input
  const failures: string[] = []

  if (checkout.status !== 'ready_for_payment') failures.push(`Checkout is ${checkout.status}`)
  if (order.status !== 'APPROVED') failures.push(`PayPal order is ${order.status}, not APPROVED`)
  if (order.currency !== checkout.quote.currency) failures.push(`Currency changed to ${order.currency}`)
  if (compareMoney(order.amount, checkout.quote.total) !== 0) {
    failures.push(`Amount changed from $${checkout.quote.total} to $${order.amount}`)
  }
  if (order.customId !== mandate.fingerprint) failures.push('PayPal order does not carry this mandate fingerprint')
  if (!verifyFingerprint(mandate.canonical, mandate.fingerprint)) failures.push('Mandate content does not match its fingerprint')
  if (mandate.status !== 'active') failures.push(`Mandate is ${mandate.status}`)
  if (mandate.usesLeft <= 0) failures.push('Mandate has no uses left')
  if (mandate.expiresAt <= now) failures.push('Mandate has expired')
  if (!order.payerId) failures.push('PayPal did not return a payer')
  else if (boundPayerId && order.payerId !== boundPayerId) failures.push('The PayPal payer is not the mandate holder')

  return {
    ok: failures.length === 0,
    failures,
    bindPayerId: failures.length === 0 && !boundPayerId ? order.payerId : null,
  }
}
