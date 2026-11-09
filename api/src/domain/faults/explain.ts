import type { FaultDecision, FaultFacts } from './types'

export interface ExplainContext {
  agentName: string
  merchantName: string
  amount: string
  /** Plain description of what was asked vs bought, e.g. "size 10" / "size 9". */
  asked?: string
  bought?: string
  shipped?: string
  deliverBy?: string | null
  returnPolicy?: string
}

/**
 * One template per rule. The outcome and amounts come from the rule result,
 * so an explanation can never disagree with the decision.
 */
export function explainDecision(decision: FaultDecision, facts: FaultFacts, ctx: ExplainContext): string {
  const asked = ctx.asked ?? 'what the mandate allowed'
  const bought = ctx.bought ?? facts.orderedSku
  switch (decision.rule) {
    case 'R1':
      return 'This looks like a payment you did not make, or the payer does not match the mandate. PayPal handles this through its Resolution Center. Sayso will not move any money.'
    case 'R2':
      return `The order was for ${facts.orderedSku}, but ${ctx.merchantName} shipped ${facts.shippedSku}. ${ctx.merchantName} is responsible. Refund of $${ctx.amount}.`
    case 'R3':
      return `It was due by ${ctx.deliverBy ?? facts.deliverBy} and has not been delivered. ${ctx.merchantName} is responsible. Refund of $${ctx.amount}.`
    case 'R4':
      return `The item arrived damaged. ${ctx.merchantName} is responsible to you. Refund of $${ctx.amount}.`
    case 'R5':
      return `${ctx.agentName} ordered ${bought}, which was outside your mandate (${asked}), but you approved it after a warning. ${ctx.merchantName}'s normal return policy applies.${ctx.returnPolicy ? ` ${ctx.returnPolicy}` : ''}`
    case 'R6':
      return `You asked for ${asked}. ${ctx.agentName} ordered ${bought}. ${ctx.agentName} is responsible. Your $${ctx.amount} refund is on its way, and ${ctx.agentName} repays ${ctx.merchantName}.`
    case 'R7':
      return `${ctx.agentName} judged ${bought} to match ${asked}, and you disagree. The agent made that call, so ${ctx.agentName} is responsible. Refund of $${ctx.amount}, repaid to ${ctx.merchantName} by ${ctx.agentName}.`
    case 'R8':
      return `It is due by ${ctx.deliverBy ?? facts.deliverBy ?? 'the agreed date'}, which has not passed yet. Nobody is at fault so far.`
    case 'R9':
      return `What was ordered matched your mandate and arrived as ordered. Nobody is at fault. ${ctx.merchantName}'s normal return policy applies, and Sayso has prepared the evidence.${ctx.returnPolicy ? ` ${ctx.returnPolicy}` : ''}`
  }
}
