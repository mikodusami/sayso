import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { api, type CardLine, type Checkout, type Finding } from '../../lib/api'
import { ChecksList, ErrorNote, MandateCard } from '../../components/ui'
import { PayButtons } from './PayButtons'

export interface HostedCheckout extends Checkout {
  mandate_card: CardLine[]
  fingerprint: string
  merchant_name: string
  agent_name: string
  needs_acceptance: boolean
  payments: { mode: 'paypal' | 'fake'; clientId: string | null }
}

export function PayPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const link = params.get('t') ?? ''
  const [checkout, setCheckout] = useState<HostedCheckout | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [complaint, setComplaint] = useState('')
  const [finding, setFinding] = useState<Finding | null>(null)

  const load = useCallback(() => api<HostedCheckout>(`/v1/hosted/checkouts/${id}`, { auth: { link } }).then(setCheckout, setError), [id, link])
  useEffect(() => {
    load()
  }, [load])

  const accept = async () => {
    try {
      await api(`/v1/hosted/checkouts/${id}/accept`, { method: 'POST', auth: { link } })
      await load()
    } catch (e) {
      setError(e)
    }
  }

  const complain = async () => {
    try {
      setFinding(await api<Finding>(`/v1/hosted/checkouts/${id}/complaints`, { body: { text: complaint }, auth: { link } }))
    } catch (e) {
      setError(e)
    }
  }

  if (!checkout) return <main className="narrow"><ErrorNote error={error} /></main>
  const q = checkout.quote
  const problems = checkout.checks.filter((c) => c.result !== 'pass')

  return (
    <main className="narrow">
      <p className="eyebrow">Sayso · pay {checkout.merchant_name}</p>
      <h1>{checkout.product_title}</h1>
      <p className="muted">Proposed by {checkout.agent_name}</p>

      <table className="totals">
        <tbody>
          <tr><td>Item × {q.quantity}</td><td>${q.itemTotal}</td></tr>
          <tr><td>Shipping</td><td>${q.shipping}</td></tr>
          <tr><td>Tax</td><td>${q.tax}</td></tr>
          <tr className="total"><td>Total</td><td>${q.total}</td></tr>
        </tbody>
      </table>

      {problems.length === 0 ? (
        <div className="note ok"><strong>Matches your mandate.</strong></div>
      ) : (
        <div className="note warn"><strong>{checkout.flagged ? 'This order breaks your mandate.' : 'Your agent needs your OK.'}</strong></div>
      )}
      <ChecksList checks={checkout.checks} onlyProblems />

      <ErrorNote error={error} />

      {checkout.status === 'ready_for_payment' && checkout.needs_acceptance && (
        <button className="warn" onClick={accept}>I understand. Let me pay anyway.</button>
      )}
      {checkout.status === 'needs_shopper' && (
        <button className="primary" onClick={accept}>That’s fine. Continue.</button>
      )}
      {checkout.status === 'ready_for_payment' && !checkout.needs_acceptance && (
        <PayButtons checkout={checkout} link={link} onPaid={load} onError={setError} />
      )}

      {checkout.status === 'paid' && (
        <>
          <div className="note ok">
            <strong>Paid with PayPal.</strong> Capture <code>{checkout.capture_id}</code>
          </div>
          <h2>Something wrong?</h2>
          {finding ? (
            <div className="note info">
              <strong>Rule {finding.rule}: {finding.fault === 'none' ? 'nobody' : finding.fault} at fault.</strong>
              <p>{finding.explanation}</p>
            </div>
          ) : (
            <div className="row">
              <input value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="e.g. These are charcoal, not grey" />
              <button onClick={complain} disabled={complaint.length < 3}>Tell Sayso</button>
            </div>
          )}
        </>
      )}
      {(checkout.status === 'failed' || checkout.status === 'blocked') && (
        <div className="note error"><strong>Not paid.</strong> {checkout.failure_reason}</div>
      )}

      <details>
        <summary>Your mandate</summary>
        <MandateCard lines={checkout.mandate_card} fingerprint={checkout.fingerprint} />
      </details>
    </main>
  )
}
