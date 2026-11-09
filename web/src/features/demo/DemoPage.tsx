import { ErrorNote } from '../../components/ui'
import { API_URL } from '../../lib/api'
import { MerchantPanel } from './MerchantPanel'
import { ProviderPanel } from './ProviderPanel'
import { ShopperPanel } from './ShopperPanel'
import { useDemo } from './useDemo'

/** One screen, three parties. Everything here goes through the public Sayso API. */
export function DemoPage() {
  const { state, sessions, error, tick, refresh, reset } = useDemo()

  return (
    <main className="wide">
      <header className="topbar">
        <div>
          <strong>Sayso</strong> <span className="muted">demo console</span>
        </div>
        {state && (
          <div className="muted small">
            payments: {state.drivers.payments} · ai: {state.drivers.ai} · agent: {state.drivers.agent} · <a href={`${API_URL}/v1`}>API</a>
          </div>
        )}
        <button className="link" onClick={reset}>Reset demo</button>
      </header>
      <ErrorNote error={error} />
      {!state || !sessions ? (
        <p className="muted">Connecting to the API at {API_URL}…</p>
      ) : (
        <div className="grid">
          <ShopperPanel onChange={refresh} />
          <MerchantPanel token={sessions.merchant} state={state} tick={tick} onChange={refresh} />
          <div className="stack">
            <ProviderPanel token={sessions.provider} merchantToken={sessions.merchant} tick={tick} />
          </div>
        </div>
      )}
    </main>
  )
}
