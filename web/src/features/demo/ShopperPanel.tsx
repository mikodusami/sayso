import { useState } from 'react'
import { Link } from 'react-router'
import { api, linkTokenOf, pathOf, type CardLine, type Check, type Checkout } from '../../lib/api'
import { Badge, ChecksList, ErrorNote, MandateCard, Panel } from '../../components/ui'

type Card =
  | { type: 'questions'; questions: string[] }
  | { type: 'mandate'; mandateId: string; approvalUrl: string; fingerprint: string; lines: CardLine[] }
  | { type: 'candidates'; items: Array<{ sku: string; title: string; total: string; outcome: 'pass' | 'fail' | 'ask'; checks: Check[] }> }
  | { type: 'checkout'; checkoutId: string; status: string; payUrl: string | null }

interface Message {
  role: 'user' | 'agent'
  text: string
  cards?: Card[]
}

interface AgentState {
  mandateId: string | null
  draft: unknown
}

const EXAMPLE = 'Get me trail running shoes, size 10, black or grey, under $120, here by Friday'

export function ShopperPanel({ onChange }: { onChange: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [state, setState] = useState<AgentState>({ mandateId: null, draft: null })
  const [input, setInput] = useState(EXAMPLE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [careless, setCareless] = useState<{ sku: string; result?: Checkout; error?: unknown }>({ sku: 'RTR-GRY-9' })

  const send = async (text: string) => {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    const history = messages.map((m) => ({ role: m.role, text: m.text }))
    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
    try {
      const reply = await api<{ text: string; cards: Card[]; state: AgentState }>('/demo/agent/chat', { body: { message: text, history, state } })
      setMessages((m) => [...m, { role: 'agent', text: reply.text, cards: reply.cards }])
      setState(reply.state)
      onChange()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const approveInline = async (card: Extract<Card, { type: 'mandate' }>) => {
    try {
      await api(`/v1/hosted/mandates/${card.mandateId}/approve`, { method: 'POST', auth: { link: linkTokenOf(card.approvalUrl) } })
      setMessages((m) => [...m, { role: 'user', text: '(approved the mandate)' }])
      onChange()
    } catch (e) {
      setError(e)
    }
  }

  const carelessBuy = async () => {
    if (!state.mandateId) return
    try {
      const result = await api<Checkout>('/demo/careless-buy', { body: { mandate_id: state.mandateId, sku: careless.sku } })
      setCareless({ sku: careless.sku, result })
    } catch (e) {
      setCareless({ sku: careless.sku, error: e })
    }
    onChange()
  }

  const newTask = () => {
    setMessages([])
    setState({ mandateId: null, draft: null })
    setInput(EXAMPLE)
    setCareless({ sku: 'RTR-GRY-9' })
  }

  return (
    <Panel title="Shopper + agent" actions={<button className="link" onClick={newTask}>New task</button>}>
      <p className="muted">Maya chats with QuickCart Assistant, an agent that calls the Sayso API.</p>
      <div className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <p>{m.text}</p>
            {m.cards?.map((card, j) => <CardView key={j} card={card} onApprove={approveInline} />)}
          </div>
        ))}
      </div>
      <ErrorNote error={error} />
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the agent…" disabled={busy} />
        <button className="primary" disabled={busy}>Send</button>
      </form>
      <div className="quick">
        {['Yes, including shipping', 'Go ahead'].map((q) => (
          <button key={q} className="chip" onClick={() => send(q)} disabled={busy}>{q}</button>
        ))}
      </div>

      {state.mandateId && (
        <div className="careless">
          <h3>Careless agent</h3>
          <p className="muted">QuickCart Turbo skips the guard and orders straight from the merchant on this mandate.</p>
          <div className="row">
            <select value={careless.sku} onChange={(e) => setCareless({ sku: e.target.value })}>
              {['RTR-GRY-9', 'RTR-GRY-105', 'CNY-NVY-10', 'RTR-PRO-GRY-10'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button onClick={carelessBuy}>Let QuickCart Turbo buy it</button>
          </div>
          <ErrorNote error={careless.error} />
          {careless.result && (
            <div className="note warn">
              <Badge tone="warn">flagged</Badge> Merchant is in flag mode, so the order went through with the liability on QuickCart Turbo.{' '}
              {careless.result.pay_url && <Link to={pathOf(careless.result.pay_url)} target="_blank">Open Maya’s pay page ↗</Link>}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

function CardView({ card, onApprove }: { card: Card; onApprove: (c: Extract<Card, { type: 'mandate' }>) => void }) {
  switch (card.type) {
    case 'questions':
      return null
    case 'mandate':
      return (
        <div className="card">
          <MandateCard lines={card.lines} fingerprint={card.fingerprint} />
          <div className="row">
            <Link to={pathOf(card.approvalUrl)} target="_blank">Open approval page ↗</Link>
            <button onClick={() => onApprove(card)}>Approve as Maya</button>
          </div>
        </div>
      )
    case 'candidates':
      return (
        <ul className="candidates">
          {card.items.map((item) => (
            <li key={item.sku}>
              <div className="row spread">
                <span>{item.title}</span>
                <span>
                  ${item.total} <Badge tone={item.outcome === 'pass' ? 'ok' : item.outcome === 'ask' ? 'warn' : 'bad'}>{item.outcome}</Badge>
                </span>
              </div>
              <ChecksList checks={item.checks} onlyProblems />
            </li>
          ))}
        </ul>
      )
    case 'checkout':
      return card.payUrl ? (
        <div className="card">
          <Link className="button primary" to={pathOf(card.payUrl)} target="_blank">Open Maya’s PayPal payment page ↗</Link>
        </div>
      ) : null
  }
}
