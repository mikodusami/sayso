import { Link } from 'react-router'
import { API_URL } from '../../lib/api'

export function HomePage() {
  return (
    <main className="narrow">
      <p className="eyebrow">Sayso</p>
      <h1>Proof of what you asked your agent to buy.</h1>
      <p>
        AI agents can now shop at PayPal merchants. Sayso makes every agent purchase carry a signed mandate, checks it before PayPal
        takes the money, and when something goes wrong, finds who was at fault and settles it with PayPal refunds and payouts.
      </p>
      <p>
        <Link className="button primary" to="/demo">Open the demo console</Link>
      </p>
      <p className="muted">
        Sayso is an API for merchants and agent providers. This web app is a thin client: the hosted approval and payment pages, and a demo
        console. See <a href={`${API_URL}/v1`}>the API index</a>.
      </p>
    </main>
  )
}
