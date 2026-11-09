// Money is a string with exactly two decimals ("118.00"), as PayPal sends it.
// All maths happens in whole cents.

const MONEY_RE = /^-?\d+\.\d{2}$/

export type Money = string

export function isMoney(value: string): boolean {
  return MONEY_RE.test(value)
}

export function toCents(value: Money): number {
  if (!isMoney(value)) throw new Error(`Not a money string: "${value}"`)
  const negative = value.startsWith('-')
  const [whole, fraction] = value.replace('-', '').split('.') as [string, string]
  const cents = Number(whole) * 100 + Number(fraction)
  return negative ? -cents : cents
}

export function fromCents(cents: number): Money {
  if (!Number.isInteger(cents)) throw new Error(`Cents must be an integer, got ${cents}`)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Accepts "120", "120.5", "$120.50" and returns "120.50". */
export function normaliseMoney(input: string | number): Money {
  const cleaned = String(input).replace(/[$,\s]/g, '')
  const value = Number(cleaned)
  if (!Number.isFinite(value)) throw new Error(`Not an amount: "${input}"`)
  return fromCents(Math.round(value * 100))
}

export const addMoney = (...values: Money[]): Money => fromCents(values.reduce((sum, v) => sum + toCents(v), 0))
export const subtractMoney = (a: Money, b: Money): Money => fromCents(toCents(a) - toCents(b))
export const multiplyMoney = (a: Money, times: number): Money => fromCents(toCents(a) * times)
export const compareMoney = (a: Money, b: Money): number => toCents(a) - toCents(b)
export const formatUsd = (value: Money): string => `$${value}`
