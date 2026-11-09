import type { CheckResult, MandateDraft } from '../domain'

// The reference shopping agent plays the part of an agent provider's product.
// It only ever acts through this toolbox, which calls Sayso the way any
// agent provider would. It has no way to capture, refund or pay out.

export interface ProductCandidate {
  merchantId: string
  merchantName: string
  sku: string
  title: string
  attributes: Record<string, string>
  total: string
}

export interface CandidateCheck {
  sku: string
  title: string
  total: string
  outcome: 'pass' | 'fail' | 'ask'
  checks: CheckResult[]
}

export interface ShoppingToolbox {
  parseRequest(text: string): Promise<{ draft: MandateDraft; questions: string[] }>
  createMandate(draft: MandateDraft): Promise<{ mandateId: string; approvalUrl: string; fingerprint: string; lines: Array<{ label: string; value: string }> }>
  mandateStatus(mandateId: string): Promise<{ status: string; item: string }>
  searchProducts(query: string): Promise<ProductCandidate[]>
  checkCandidate(mandateId: string, candidate: ProductCandidate): Promise<CandidateCheck>
  createCheckout(mandateId: string, candidate: ProductCandidate): Promise<{ checkoutId: string; status: string; payUrl: string | null; checks: CheckResult[] }>
}

export type AgentCard =
  | { type: 'questions'; questions: string[] }
  | { type: 'mandate'; mandateId: string; approvalUrl: string; fingerprint: string; lines: Array<{ label: string; value: string }> }
  | { type: 'candidates'; items: CandidateCheck[] }
  | { type: 'checkout'; checkoutId: string; status: string; payUrl: string | null }

export interface AgentState {
  mandateId: string | null
  draft: MandateDraft | null
}

export interface AgentTurn {
  message: string
  history: Array<{ role: 'user' | 'agent'; text: string }>
  state: AgentState
  toolbox: ShoppingToolbox
}

export interface AgentReply {
  text: string
  cards: AgentCard[]
  state: AgentState
}

export interface ShoppingAgent {
  readonly name: string
  respond(turn: AgentTurn): Promise<AgentReply>
}
