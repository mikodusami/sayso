import { useEffect, useState } from 'react'
import { api, type CardLine, type Checkout, type Finding, type TimelineEvent } from '../../lib/api'
import { Badge, ChecksList, ErrorNote, Panel, Timeline } from '../../components/ui'
import type { DemoState } from './useDemo'

interface OrderDetail extends Checkout {
  agent: { name: string; runs_guard: boolean } | null
  asked: { card: CardLine[]; original_text: string; fingerprint: string } | null
  bought: { sku: string; title: string; attributes: Record<string, string>; total: string }
  shipped: { shipped_sku: string; carrier: string; tracking_number: string; status: string; paypal_tracker_id: string | null } | null
  findings: Array<{ id: string; rule: string; fault: string; status: string }>
  timeline: TimelineEvent[]
}

const FAULT_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info'> = { agent: 'bad', merchant: 'bad', shopper: 'warn', none: 'ok', none_yet: 'info', paypal: 'info' }

export function MerchantPanel({ token, state, tick, onChange }: { token: string; state: DemoState; tick: number; onChange: () => void }) {
  const auth = { demo: token }
  const [orders, setOrders] = useState<Checkout[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [shipSku, setShipSku] = useState('')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    api<{ data: Checkout[] }>('/v1/orders', { auth }).then((r) => setOrders(r.data), setError)
    api<{ data: Finding[] }>('/v1/findings', { auth }).then((r) => setFindings(r.data), setError)
    if (selected) api<OrderDetail>(`/v1/orders/${selected}`, { auth }).then(setDetail, setError)
  }, [tick, selected, token])

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      onChange()
    } catch (e) {
      setError(e)
    }
  }

  const mode = state.merchant.settings.verifierMode

  return (
    <Panel
      title={state.merchant.name}
      actions={
        <label className="toggle">
          Verifier
          <select value={mode} onChange={(e) => run(() => api('/v1/settings', { method: 'PATCH', body: { verifier_mode: e.target.value }, auth }))}>
            <option value="block">block</option>
            <option value="flag">flag</option>
          </select>
        </label>
      }
    >
      <ErrorNote error={error} />
      <h3>Agent orders</h3>
      {!orders.length && <p className="muted">No agent orders yet.</p>}
      <ul className="orders">
        {orders.map((o) => (
          <li key={o.id} className={o.id === selected ? 'selected' : ''} onClick={() => { setSelected(o.id); setShipSku(o.quote.sku) }}>
            <span>{o.product_title} <code>{o.quote.sku}</code></span>
            <span>
              ${o.quote.total}{' '}
              {o.status === 'blocked' ? <Badge tone="bad">blocked</Badge> : o.flagged ? <Badge tone="warn">flagged</Badge> : <Badge tone="ok">verified</Badge>}{' '}
              <Badge tone="info">{o.status.replace(/_/g, ' ')}</Badge>
            </span>
          </li>
        ))}
      </ul>

      {detail && (
        <div className="detail">
          <div className="columns">
            <div>
              <h4>Asked</h4>
              {detail.asked?.card.filter((l) => ['item', 'must match', 'max total', 'deliver by'].includes(l.label)).map((l) => (
                <p key={l.label}><span className="muted">{l.label}</span><br />{l.value}</p>
              ))}
            </div>
            <div>
              <h4>Bought</h4>
              <p>{detail.bought.title}<br /><code>{detail.bought.sku}</code></p>
              {Object.entries(detail.bought.attributes).map(([k, v]) => <p key={k}><span className="muted">{k}</span> {v}</p>)}
              <p><span className="muted">total</span> ${detail.bought.total}</p>
              <p className="muted">by {detail.agent?.name}</p>
            </div>
            <div>
              <h4>Shipped</h4>
              {detail.shipped ? (
                <>
                  <p><code>{detail.shipped.shipped_sku}</code></p>
                  <p>{detail.shipped.carrier} {detail.shipped.tracking_number}</p>
                  <p><Badge tone="info">{detail.shipped.status}</Badge></p>
                </>
              ) : detail.status === 'paid' ? (
                <div className="stack">
                  <input value={shipSku} onChange={(e) => setShipSku(e.target.value)} aria-label="Shipped SKU" />
                  <button onClick={() => run(() => api(`/v1/orders/${detail.id}/shipments`, { body: { carrier: 'USPS', tracking_number: `9400${Date.now().toString().slice(-8)}`, shipped_sku: shipSku }, auth }))}>
                    Ship
                  </button>
                </div>
              ) : (
                <p className="muted">Not paid</p>
              )}
              {detail.shipped?.status === 'shipped' && (
                <button className="link" onClick={() => run(() => api(`/v1/orders/${detail.id}/delivered`, { method: 'POST', auth }))}>Mark delivered</button>
              )}
            </div>
          </div>
          <ChecksList checks={detail.checks} onlyProblems />
          <details>
            <summary>Timeline ({detail.timeline.length})</summary>
            <Timeline events={detail.timeline} />
          </details>
        </div>
      )}

      <h3>Findings</h3>
      {!findings.length && <p className="muted">No complaints yet.</p>}
      <ul className="findings">
        {findings.map((f) => (
          <li key={f.id}>
            <div className="row spread">
              <span>
                <strong>{f.rule}</strong> <Badge tone={FAULT_TONE[f.fault] ?? 'info'}>{f.fault === 'none' ? 'nobody' : f.fault} at fault</Badge>
              </span>
              <Badge tone={f.status === 'done' ? 'ok' : f.status === 'failed' ? 'bad' : 'info'}>{f.status}</Badge>
            </div>
            <p>{f.explanation}</p>
            {f.refund_id && <p className="muted">Refund <code>{f.refund_id}</code>{f.payout_batch_id && <> · Payout <code>{f.payout_batch_id}</code></>}</p>}
            {f.failure_reason && <p className="muted">{f.failure_reason}</p>}
            {f.status === 'proposed' && (
              <div className="row">
                <button className="primary" onClick={() => run(() => api(`/v1/findings/${f.id}/confirm`, { method: 'POST', auth }))}>Confirm ${f.amount} refund</button>
                <button className="link" onClick={() => run(() => api(`/v1/findings/${f.id}/appeal`, { body: { note: 'Merchant disagrees' }, auth }))}>Dispute finding</button>
              </div>
            )}
            {f.status === 'failed' && <button onClick={() => run(() => api(`/v1/findings/${f.id}/retry`, { method: 'POST', auth }))}>Retry</button>}
            {f.status === 'reimbursing' && <button className="link" onClick={() => run(() => api(`/v1/findings/${f.id}/refresh`, { method: 'POST', auth }))}>Check payout</button>}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
