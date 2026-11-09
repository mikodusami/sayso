import { isStepCount, tool, ToolLoopAgent, type ModelMessage } from 'ai'
import { z } from 'zod'
import type { AgentCard, AgentReply, AgentState, AgentTurn, CandidateCheck, ShoppingAgent } from '../../ports'

// The reference shopping agent. It stands in for an agent provider's product
// and acts only through the toolbox (the Sayso API). Two versions:
//   scripted - deterministic, offline, follows the demo flow
//   gateway  - a real model in a tool loop

const best = (checks: CandidateCheck[]) =>
  checks.find((c) => c.outcome === 'pass') ?? checks.find((c) => c.outcome === 'ask') ?? null

export function createScriptedShoppingAgent(): ShoppingAgent {
  return {
    name: 'scripted',
    async respond({ message, state, toolbox }: AgentTurn): Promise<AgentReply> {
      const cards: AgentCard[] = []

      // 1. No mandate yet: turn the request into one.
      if (!state.mandateId) {
        const text = state.draft ? `${state.draft.original_text}. ${message}` : message
        const { draft, questions } = await toolbox.parseRequest(text)
        if (questions.length) {
          cards.push({ type: 'questions', questions })
          return { text: questions.join(' '), cards, state: { mandateId: null, draft } }
        }
        const mandate = await toolbox.createMandate(draft)
        cards.push({ type: 'mandate', ...mandate })
        return {
          text: 'Here is what I will shop for. Approve it, then tell me to go ahead.',
          cards,
          state: { mandateId: mandate.mandateId, draft: null },
        }
      }

      // 2. Mandate exists: shop once it is approved.
      const status = await toolbox.mandateStatus(state.mandateId)
      if (status.status === 'pending_approval') {
        return { text: 'Please approve the mandate first. I cannot buy anything until you do.', cards, state }
      }
      if (status.status !== 'active') {
        return { text: `That mandate is ${status.status.replace('_', ' ')}. Tell me what to shop for next.`, cards, state: { mandateId: null, draft: null } }
      }

      const products = await toolbox.searchProducts(status.item)
      const checks = await Promise.all(products.map((p) => toolbox.checkCandidate(state.mandateId!, p)))
      cards.push({ type: 'candidates', items: checks })
      const pick = best(checks)
      if (!pick) return { text: 'Nothing I found fits your mandate. I have not bought anything.', cards, state }

      const product = products.find((p) => p.sku === pick.sku)!
      const checkout = await toolbox.createCheckout(state.mandateId, product)
      cards.push({ type: 'checkout', checkoutId: checkout.checkoutId, status: checkout.status, payUrl: checkout.payUrl })
      const rejected = checks.filter((c) => c.outcome === 'fail').length
      const lead = rejected ? `I skipped ${rejected} that broke your mandate. ` : ''
      const text = checkout.status === 'needs_shopper'
        ? `${lead}${pick.title} needs your OK on one detail before you pay.`
        : `${lead}${pick.title} fits everything you asked for. Total $${pick.total}. Pay with PayPal when ready.`
      return { text, cards, state }
    },
  }
}

export function createGatewayShoppingAgent(options: { model: string }): ShoppingAgent {
  return {
    name: `gateway:${options.model}`,
    async respond({ message, history, state, toolbox }: AgentTurn): Promise<AgentReply> {
      const cards: AgentCard[] = []
      let next: AgentState = { ...state }

      const agent = new ToolLoopAgent({
        model: options.model,
        stopWhen: isStepCount(8),
        instructions: [
          'You are a careful shopping agent. You never buy anything outside the shopper\'s signed mandate.',
          'Flow: parse_request -> if questions, ask them and stop -> create_mandate -> tell the shopper to approve it and stop.',
          'Once a mandate exists and is active: search_products -> check_candidate for each -> create_checkout for the best passing one.',
          'You cannot pay, capture or refund. The shopper pays with PayPal on the link Sayso gives them.',
          'Keep replies to two short sentences.',
          `Current mandate id: ${state.mandateId ?? 'none'}.`,
        ].join('\n'),
        tools: {
          parse_request: tool({
            description: 'Turn the shopper words into a draft mandate and clarifying questions.',
            inputSchema: z.object({ text: z.string() }),
            execute: async ({ text }) => {
              const result = await toolbox.parseRequest(text)
              next = { ...next, draft: result.draft }
              if (result.questions.length) cards.push({ type: 'questions', questions: result.questions })
              return result
            },
          }),
          create_mandate: tool({
            description: 'Create the mandate from the last complete draft. Returns an approval link for the shopper.',
            inputSchema: z.object({}),
            execute: async () => {
              if (!next.draft) return { error: 'Call parse_request first' }
              const mandate = await toolbox.createMandate(next.draft)
              next = { mandateId: mandate.mandateId, draft: null }
              cards.push({ type: 'mandate', ...mandate })
              return { mandateId: mandate.mandateId, approvalUrl: mandate.approvalUrl }
            },
          }),
          mandate_status: tool({
            description: 'Check whether the shopper has approved the mandate.',
            inputSchema: z.object({}),
            execute: async () => (next.mandateId ? toolbox.mandateStatus(next.mandateId) : { status: 'none' }),
          }),
          search_products: tool({
            description: 'Search merchant catalogs.',
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }) => toolbox.searchProducts(query),
          }),
          check_candidate: tool({
            description: 'Check one product against the mandate. Returns pass, fail or ask, with reasons.',
            inputSchema: z.object({ sku: z.string(), query: z.string() }),
            execute: async ({ sku, query }) => {
              if (!next.mandateId) return { error: 'No mandate yet' }
              const product = (await toolbox.searchProducts(query)).find((p) => p.sku === sku)
              if (!product) return { error: `No product ${sku}` }
              const check = await toolbox.checkCandidate(next.mandateId, product)
              const existing = cards.find((c) => c.type === 'candidates')
              if (existing && existing.type === 'candidates') existing.items.push(check)
              else cards.push({ type: 'candidates', items: [check] })
              return check
            },
          }),
          create_checkout: tool({
            description: 'Create a checkout for a product that passed. Sayso gives the shopper a PayPal payment link.',
            inputSchema: z.object({ sku: z.string(), query: z.string() }),
            execute: async ({ sku, query }) => {
              if (!next.mandateId) return { error: 'No mandate yet' }
              const product = (await toolbox.searchProducts(query)).find((p) => p.sku === sku)
              if (!product) return { error: `No product ${sku}` }
              const checkout = await toolbox.createCheckout(next.mandateId, product)
              cards.push({ type: 'checkout', checkoutId: checkout.checkoutId, status: checkout.status, payUrl: checkout.payUrl })
              return checkout
            },
          }),
        },
      })

      const messages: ModelMessage[] = [
        ...history.map((h): ModelMessage => (h.role === 'user' ? { role: 'user', content: h.text } : { role: 'assistant', content: h.text })),
        { role: 'user', content: message },
      ]
      const result = await agent.generate({ messages })
      return { text: result.text, cards, state: next }
    },
  }
}
