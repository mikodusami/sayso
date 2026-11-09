export type CheckOutcome = 'pass' | 'fail' | 'ask'

export interface CheckResult {
  name: string
  result: CheckOutcome
  reason: string
  /** Who decided: code is deterministic, ai is a judgement call. */
  source: 'code' | 'ai'
  field?: string
  confidence?: number
}

/** A fuzzy constraint that code could not settle and needs a judgement. */
export interface FuzzyQuestion {
  field: string
  allowed: string[]
  productValue: string
}

export interface FuzzyVerdict {
  verdict: 'match' | 'no_match' | 'unsure'
  confidence: number
  reason: string
}

export interface CheckSummary {
  outcome: CheckOutcome
  failures: CheckResult[]
  asks: CheckResult[]
  /** Fields that passed only because AI judged them a match (rule R7). */
  aiJudgedFields: string[]
}
