import type { ComplaintClassification, Constraint, FuzzyQuestion, FuzzyVerdict, MandateDraft } from '../../domain'
import type { AiService, ComplaintContext } from '../../ports'
import { addDays, isoDate, normaliseMoney } from '../../shared'

// A rule-based stand-in for the AI jobs. It runs offline, is deterministic,
// and covers the demo phrasing. Switch AI_DRIVER=gateway for real models.

const COLOURS = ['black', 'grey', 'gray', 'white', 'navy', 'blue', 'red', 'green', 'charcoal', 'brown', 'beige', 'pink', 'orange', 'yellow', 'purple', 'silver']

const COLOUR_FAMILIES: Record<string, string[]> = {
  grey: ['grey', 'gray', 'charcoal', 'slate', 'graphite', 'ash', 'silver', 'stone', 'smoke', 'pewter'],
  black: ['black', 'onyx', 'jet', 'obsidian', 'ebony'],
  blue: ['blue', 'navy', 'cobalt', 'indigo', 'ink', 'royal', 'sky'],
  white: ['white', 'ivory', 'cream', 'bone', 'snow'],
  red: ['red', 'crimson', 'burgundy', 'maroon'],
  green: ['green', 'olive', 'forest', 'khaki'],
  brown: ['brown', 'tan', 'mocha', 'chocolate', 'beige'],
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function familyOf(word: string): string | null {
  const w = word.toLowerCase()
  for (const [family, members] of Object.entries(COLOUR_FAMILIES)) if (members.includes(w)) return family
  return null
}

function nextWeekday(today: string, name: string): string {
  const start = new Date(`${today}T12:00:00Z`)
  const target = WEEKDAYS.indexOf(name)
  for (let i = 1; i <= 7; i++) {
    const day = addDays(start, i)
    if (day.getUTCDay() === target) return isoDate(day)
  }
  return today
}

function categoryFor(text: string): string {
  if (/\b(shoe|shoes|sneaker|runner|runners|boot|boots|trainers)\b/i.test(text)) return 'footwear'
  if (/\b(jacket|shirt|hoodie|pants|socks)\b/i.test(text)) return 'apparel'
  return 'general'
}

export function parseRequestHeuristically(text: string, today: string): MandateDraft {
  const lower = text.toLowerCase()
  const constraints: Constraint[] = []

  const size = lower.match(/\bsize\s*(?:us\s*)?(\d+(?:\.\d)?)\b/)
  if (size?.[1]) constraints.push({ field: 'size', kind: 'exact', op: 'eq', values: [size[1]] })

  const colours = [...new Set(COLOURS.filter((c) => new RegExp(`\\b${c}\\b`).test(lower)).map((c) => (c === 'gray' ? 'grey' : c)))]
  if (colours.length) constraints.push({ field: 'colour', kind: 'fuzzy', op: 'one_of', values: colours })

  const budget = lower.match(/(?:under|below|less than|max(?:imum)?|up to|budget(?: of)?|no more than)\s*\$?\s*(\d+(?:\.\d{1,2})?)/) ?? lower.match(/\$\s*(\d+(?:\.\d{1,2})?)/)
  const includesShipping = /\b(including|incl\.?|with) (shipping|delivery)\b|\ball[- ]in\b/.test(lower)
    ? true
    : /\b(plus|before|excluding|not including) (shipping|delivery)\b/.test(lower)
      ? false
      : null

  let deliverBy: string | null = null
  const weekday = WEEKDAYS.find((d) => new RegExp(`\\bby (?:this )?${d}\\b`).test(lower))
  if (weekday) deliverBy = nextWeekday(today, weekday)
  else if (/\bby tomorrow\b/.test(lower)) deliverBy = isoDate(addDays(new Date(`${today}T12:00:00Z`), 1))
  const explicit = lower.match(/\bby (\d{4}-\d{2}-\d{2})\b/)
  if (explicit?.[1]) deliverBy = explicit[1]

  const quantity = lower.match(/\b(\d+)\s*(?:pairs?|units?|x)\b/)
  const description = text
    .split(/,|\bsize\b|\bunder\b|\bbelow\b|\bin (?:black|grey|gray|white|navy|blue)\b|\bby\b/i)[0]!
    .replace(/^\s*(please\s+)?(get me|buy me|buy|find me|find|order|i need|i want|get)\s+(a |an |some |a pair of |the )?/i, '')
    .trim()

  return {
    original_text: text,
    item: {
      description: description || null,
      category: categoryFor(text),
      quantity: quantity?.[1] ? Math.min(10, Math.max(1, Number(quantity[1]))) : 1,
    },
    constraints,
    max_total: budget?.[1] ? normaliseMoney(budget[1]) : null,
    budget_includes_shipping: includesShipping,
    deliver_by: deliverBy,
  }
}

export function judgeHeuristically(q: FuzzyQuestion): FuzzyVerdict {
  const allowedFamilies = new Set(q.allowed.map((a) => familyOf(a) ?? a.toLowerCase()))
  const primary = q.productValue.split(/[\/,&]| and /)[0]!.trim().split(/\s+/)
  const family = primary.map(familyOf).find((f) => f !== null) ?? null
  if (!family) return { verdict: 'unsure', confidence: 0.4, reason: `No rule for "${q.productValue}"` }
  if (allowedFamilies.has(family)) {
    return { verdict: 'match', confidence: 0.85, reason: `${q.productValue} is a shade of ${family}` }
  }
  return { verdict: 'no_match', confidence: 0.9, reason: `${q.productValue} is ${family}, not ${q.allowed.join(' or ')}` }
}

export function classifyHeuristically(ctx: ComplaintContext): ComplaintClassification {
  const t = ctx.text.toLowerCase()
  const contested = new Set<string>()
  for (const c of ctx.constraints) {
    const names = c.field === 'colour' ? ['colour', 'color'] : [c.field]
    if (names.some((n) => t.includes(n))) contested.add(c.field)
    if (c.field === 'size' && /too (small|big|large|tight|loose)/.test(t)) contested.add('size')
    if (c.field === 'colour' && COLOURS.some((colour) => t.includes(colour) && !c.values.includes(colour))) contested.add('colour')
  }
  const fields = [...contested]
  const pick = (type: ComplaintClassification['type'], summary: string): ComplaintClassification => ({ type, contestedFields: fields, summary })

  if (/(didn'?t|did not|never) (buy|order|make)|not me|unauthori[sz]ed|fraud/.test(t)) return pick('did_not_buy', 'Shopper says they did not make this purchase.')
  if (/damag|broken|torn|ripped|crushed/.test(t)) return pick('damaged', 'Item arrived damaged.')
  if (/never (arrived|came|got)|not (arrived|received)|haven'?t (received|got)|where is|still waiting/.test(t)) return pick('not_received', 'Item has not arrived.')
  if (/\blate\b|too long/.test(t)) return pick('late', 'Item arrived late.')
  if (/changed my mind|don'?t want|no longer (want|need)|don'?t like/.test(t)) return pick('changed_mind', 'Shopper changed their mind.')
  if (/wrong (item|product|shoe)|not what i ordered|different (item|product)/.test(t)) return pick('wrong_item', 'A different item than expected.')
  if (fields.length) return pick('wrong_detail', `Shopper disputes the ${fields.join(' and ')}.`)
  return pick('other', 'Shopper reported a problem.')
}

export function createHeuristicAi(): AiService {
  return {
    name: 'heuristic',
    async parseRequest(text, today) {
      return { draft: parseRequestHeuristically(text, today) }
    },
    async judgeAttribute(question) {
      return judgeHeuristically(question)
    },
    async classifyComplaint(context) {
      return classifyHeuristically(context)
    },
  }
}
