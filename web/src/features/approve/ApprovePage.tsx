import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { api, type Mandate } from '../../lib/api'
import { ErrorNote, MandateCard } from '../../components/ui'

/** Hosted by Sayso, so an agent provider can never approve on the shopper's behalf. */
export function ApprovePage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const link = params.get('t') ?? ''
  const [mandate, setMandate] = useState<Mandate | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Mandate>(`/v1/hosted/mandates/${id}`, { auth: { link } }).then(setMandate, setError)
  }, [id, link])

  const approve = async () => {
    setBusy(true)
    try {
      setMandate(await api<Mandate>(`/v1/hosted/mandates/${id}/approve`, { method: 'POST', auth: { link } }))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="narrow">
      <p className="eyebrow">Sayso · approve what your agent may buy</p>
      <h1>Check your mandate</h1>
      <ErrorNote error={error} />
      {mandate && (
        <>
          <MandateCard lines={mandate.card} fingerprint={mandate.fingerprint} original={mandate.original_text} />
          {mandate.status === 'pending_approval' ? (
            <>
              <p>Your agent can only buy something that matches every line above. You still approve each payment in PayPal.</p>
              <button className="primary" onClick={approve} disabled={busy}>
                Approve this mandate
              </button>
            </>
          ) : (
            <div className="note ok">
              <strong>{mandate.status === 'active' ? 'Approved.' : `This mandate is ${mandate.status.replace('_', ' ')}.`}</strong>{' '}
              {mandate.status === 'active' && 'Go back to your agent and tell it to go ahead.'}
            </div>
          )}
        </>
      )}
    </main>
  )
}
