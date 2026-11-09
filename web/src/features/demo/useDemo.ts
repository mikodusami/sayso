import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'

export interface DemoState {
  merchant: { id: string; name: string; settings: { verifierMode: 'block' | 'flag'; autoRefundLimit: string; returnPolicy: string }; paypal_configured: boolean }
  agent_provider: { id: string; name: string }
  agents: Array<{ id: string; name: string; runsGuard: boolean }>
  drivers: { payments: string; ai: string; agent: string }
  products: Array<{ sku: string; title: string; attributes: Record<string, string>; total: string }>
}

export interface DemoSessions {
  merchant: string
  provider: string
}

/** Loads demo state and demo session tokens; `tick` bumps whenever something changed. */
export function useDemo() {
  const [state, setState] = useState<DemoState | null>(null)
  const [sessions, setSessions] = useState<DemoSessions | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    api<DemoState>('/demo/state').then(setState, setError)
  }, [tick])

  useEffect(() => {
    Promise.all([
      api<{ token: string }>('/demo/session', { body: { role: 'merchant' } }),
      api<{ token: string }>('/demo/session', { body: { role: 'agent_provider' } }),
    ]).then(([m, p]) => setSessions({ merchant: m.token, provider: p.token }), setError)
  }, [])

  // Webhooks and settlement can finish in the background, so poll gently.
  useEffect(() => {
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [refresh])

  const reset = async () => {
    const token = window.prompt('Admin token (DEMO_ADMIN_TOKEN)', 'dev-admin')
    if (!token) return
    try {
      await api('/demo/reset', { method: 'POST', headers: { 'X-Admin-Token': token } })
      window.location.reload()
    } catch (e) {
      setError(e)
    }
  }

  return { state, sessions, error, setError, tick, refresh, reset }
}
