import { useEffect, useState } from 'react'
import { api, type Finding, type TimelineEvent } from '../../lib/api'
import { Badge, ErrorNote, Panel, Timeline } from '../../components/ui'

interface Ledger {
  agents: Array<{ id: string; name: string; runs_guard: boolean }>
  totals: { findings_against_agents: number; reimbursed: string; open: string; flagged_checkouts: number; blocked_checkouts: number }
  findings: Finding[]
}

export function ProviderPanel({ token, merchantToken, tick }: { token: string; merchantToken: string; tick: number }) {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    api<Ledger>('/v1/liabilities', { auth: { demo: token } }).then(setLedger, setError)
    // One timeline across both tenants, newest first.
    Promise.all([
      api<{ data: TimelineEvent[] }>('/v1/events?limit=60', { auth: { demo: token } }),
      api<{ data: TimelineEvent[] }>('/v1/events?limit=60', { auth: { demo: merchantToken } }),
    ]).then(([a, b]) => {
      const byId = new Map([...a.data, ...b.data].map((e) => [e.id, e]))
      setEvents([...byId.values()].sort((x, y) => y.at.localeCompare(x.at)))
    }, setError)
  }, [tick, token, merchantToken])

  return (
    <>
      <Panel title="QuickCart (agent provider)">
        <ErrorNote error={error} />
        {ledger && (
          <>
            <ul className="agents">
              {ledger.agents.map((a) => (
                <li key={a.id}>
                  {a.name} {a.runs_guard ? <Badge tone="ok">runs the guard</Badge> : <Badge tone="warn">skips the guard</Badge>}
                </li>
              ))}
            </ul>
            <div className="stats">
              <div><strong>${ledger.totals.reimbursed}</strong><span>repaid to merchants</span></div>
              <div><strong>${ledger.totals.open}</strong><span>open liability</span></div>
              <div><strong>{ledger.totals.flagged_checkouts}</strong><span>flagged orders</span></div>
              <div><strong>{ledger.totals.blocked_checkouts}</strong><span>blocked orders</span></div>
            </div>
            {ledger.findings.map((f) => (
              <p key={f.id} className="muted">{f.rule}: {f.explanation}</p>
            ))}
          </>
        )}
      </Panel>
      <Panel title="Timeline">
        <Timeline events={events} />
      </Panel>
    </>
  )
}
