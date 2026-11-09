// Deterministic matching for attribute values. If code can decide, the AI is
// never asked.

const SYNONYMS: Record<string, string> = {
  gray: 'grey',
  'dark gray': 'dark grey',
  'jet black': 'black',
  'off white': 'white',
  'off-white': 'white',
}

const NOISE_WORDS = /\b(us|uk|eu|size|sz|mens|men's|womens|women's)\b/g

export function normaliseValue(value: string): string {
  let text = value.toLowerCase().trim().replace(/\s+/g, ' ')
  text = SYNONYMS[text] ?? text
  text = text.replace(NOISE_WORDS, '').replace(/\s+/g, ' ').trim()
  // "10.0" -> "10", "010" -> "10"
  if (/^\d+(\.\d+)?$/.test(text)) text = String(Number(text))
  return SYNONYMS[text] ?? text
}

export function valuesMatch(allowed: string, actual: string): boolean {
  return normaliseValue(allowed) === normaliseValue(actual)
}

/** True when the product value equals any allowed value after normalising. */
export function matchesAny(allowed: string[], actual: string): boolean {
  return allowed.some((value) => valuesMatch(value, actual))
}
