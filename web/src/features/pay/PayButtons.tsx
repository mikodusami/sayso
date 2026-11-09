import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { useState } from 'react'
import { api } from '../../lib/api'
import type { HostedCheckout } from './PayPage'

interface Props {
  checkout: HostedCheckout
  link: string
  onPaid: () => void
  onError: (error: unknown) => void
}

/**
 * Real PayPal buttons in sandbox mode; a stand-in when the API runs the fake
 * PayPal. Either way Sayso creates the order and captures it server-side,
 * after the check before capture.
 */
export function PayButtons({ checkout, link, onPaid, onError }: Props) {
  const createOrder = async () => (await api<{ order_id: string }>(`/v1/hosted/checkouts/${checkout.id}/paypal-order`, { method: 'POST', auth: { link } })).order_id
  const capture = () => api(`/v1/hosted/checkouts/${checkout.id}/capture`, { method: 'POST', auth: { link } })

  if (checkout.payments.mode === 'paypal' && checkout.payments.clientId) {
    return (
      <PayPalScriptProvider options={{ clientId: checkout.payments.clientId, currency: 'USD', intent: 'capture' }}>
        <PayPalButtons
          style={{ layout: 'vertical', label: 'pay' }}
          createOrder={createOrder}
          onApprove={async () => {
            try {
              await capture()
              onPaid()
            } catch (e) {
              onError(e)
            }
          }}
          onError={(e) => onError(e)}
        />
      </PayPalScriptProvider>
    )
  }
  return <FakePayPal createOrder={createOrder} capture={capture} onPaid={onPaid} onError={onError} />
}

function FakePayPal({ createOrder, capture, onPaid, onError }: { createOrder: () => Promise<string>; capture: () => Promise<unknown>; onPaid: () => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  const pay = async (payer: 'maya' | 'other') => {
    setBusy(true)
    try {
      const orderId = await createOrder()
      await api(`/demo/fake-paypal/orders/${orderId}/approve`, { body: { payer } })
      await capture()
      onPaid()
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fake-paypal">
      <button className="paypal" onClick={() => pay('maya')} disabled={busy}>Pay with PayPal</button>
      <p className="muted">
        Fake PayPal (no accounts configured).{' '}
        <button className="link" onClick={() => pay('other')} disabled={busy}>Pay as a different PayPal account</button> to see the payer check.
      </p>
    </div>
  )
}
