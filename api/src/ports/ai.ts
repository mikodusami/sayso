import type { ComplaintClassification, FuzzyQuestion, FuzzyVerdict, MandateDraft } from '../domain'

export interface ParsedRequest {
  draft: MandateDraft
}

export interface ComplaintContext {
  text: string
  item: string
  constraints: Array<{ field: string; values: string[] }>
  attributes: Record<string, string>
}

/**
 * The AI jobs Sayso uses. None of them can move money or decide fault:
 * outputs are validated and fed into deterministic code.
 */
export interface AiService {
  readonly name: string
  parseRequest(text: string, today: string): Promise<ParsedRequest>
  judgeAttribute(question: FuzzyQuestion): Promise<FuzzyVerdict>
  classifyComplaint(context: ComplaintContext): Promise<ComplaintClassification>
}
