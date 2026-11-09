import type { ReactNode } from 'react'
import type { CardLine, Check, TimelineEvent } from '../lib/api'

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  const details = (error as { details?: { failures?: string[]; checks?: Check[] } }).details
  return (
    <div className="note error" role="alert">
      <strong>{message}</strong>
      {details?.failures && <ul>{details.failures.map((f) => <li key={f}>{f}</li>)}</ul>}
      {details?.checks && <ChecksList checks={details.checks} onlyProblems />}
    </div>
  )
}

export function MandateCard({ lines, fingerprint, original }: { lines: CardLine[]; fingerprint: string; original?: string }) {
  return (
    <div className="mandate">
      <div className="mandate-head">
        <span>MANDATE</span>
        <code title={fingerprint}>{fingerprint.slice(0, 8)}…{fingerprint.slice(-3)}</code>
      </div>
      <dl>
        {lines.map((l) => (
          <div key={l.label}>
            <dt>{l.label}</dt>
            <dd>{l.value}</dd>
          </div>
        ))}
      </dl>
      {original && <p className="muted">“{original}”</p>}
    </div>
  )
}

const ICON = { pass: '✓', fail: '✗', ask: '?' } as const

export function ChecksList({ checks, onlyProblems = false }: { checks: Check[]; onlyProblems?: boolean }) {
  const shown = checks.filter((c) => !onlyProblems || c.result !== 'pass' || c.source === 'ai')
  if (!shown.length) return null
  return (
    <ul className="checks">
      {shown.map((c) => (
        <li key={c.name + c.reason} className={`check ${c.result} ${c.source}`}>
          <span className="icon">{ICON[c.result]}</span>
          <span>{c.reason}</span>
          {c.source === 'ai' && <span className="tag">AI judgement</span>}
        </li>
      ))}
    </ul>
  )
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="muted">Nothing yet.</p>
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <time>{new Date(e.at).toLocaleTimeString()}</time>
          <span className="kind">{e.kind}</span>
          <span>{e.message}</span>
          {e.paypal_ref && <code className="ref">{e.paypal_ref}</code>}
        </li>
      ))}
    </ol>
  )
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
