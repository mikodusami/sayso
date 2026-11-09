import { Hono } from 'hono'
import { tenantOf, type AppEnv } from '../_kit'
import { presentCheckout } from '../checkouts'
import { presentFinding } from '../findings'
import type { LiabilityService } from './service'

export function createLiabilityRoutes(liabilities: LiabilityService) {
  return new Hono<AppEnv>().get('/v1/liabilities', async (c) => {
    const provider = tenantOf(c, 'agent_provider')
    const ledger = await liabilities.ledger(provider.id)
    return c.json({
      agents: ledger.agents.map((a) => ({ id: a.id, name: a.name, runs_guard: a.runsGuard })),
      totals: {
        findings_against_agents: ledger.totals.findingsAgainstAgents,
        reimbursed: ledger.totals.reimbursed,
        open: ledger.totals.open,
        flagged_checkouts: ledger.totals.flaggedCheckouts,
        blocked_checkouts: ledger.totals.blockedCheckouts,
      },
      findings: ledger.findings.map(presentFinding),
      flagged: ledger.flagged.map((x) => presentCheckout(x)),
      blocked: ledger.blocked.map((x) => presentCheckout(x)),
    })
  })
}
