import type { Repositories } from '../../ports'
import { addMoney } from '../../shared'

/** The agent provider's ledger: what its agents got wrong and what it repaid. */
export function createLiabilityService({ repos }: { repos: Repositories }) {
  return {
    async ledger(agentProviderId: string) {
      const [findings, checkouts, agents] = await Promise.all([
        repos.findings.listForAgentProvider(agentProviderId, 200),
        repos.checkouts.listForAgentProvider(agentProviderId, 200),
        repos.agents.listForTenant(agentProviderId),
      ])
      const againstAgent = findings.filter((f) => f.decision.fault === 'agent')
      const repaid = againstAgent.filter((f) => f.status === 'done')
      const open = againstAgent.filter((f) => f.status !== 'done' && f.status !== 'closed')
      const flagged = checkouts.filter((c) => c.flagged)
      const blocked = checkouts.filter((c) => c.status === 'blocked')
      return {
        agents,
        totals: {
          findingsAgainstAgents: againstAgent.length,
          reimbursed: repaid.reduce((sum, f) => addMoney(sum, f.amount), '0.00'),
          open: open.reduce((sum, f) => addMoney(sum, f.amount), '0.00'),
          flaggedCheckouts: flagged.length,
          blockedCheckouts: blocked.length,
        },
        findings: againstAgent,
        flagged,
        blocked,
      }
    },
  }
}

export type LiabilityService = ReturnType<typeof createLiabilityService>
