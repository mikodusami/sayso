import { createMCPClient } from '@ai-sdk/mcp'

// Read-only PayPal tools for AI, through PayPal's own MCP server. Used by the
// optional merchant "ask about this order" assistant. Money-moving tools are
// never exposed to a model.
export const PAYPAL_READ_ONLY_TOOLS = [
  'get_order',
  'get_shipment_tracking',
  'list_disputes',
  'get_dispute',
  'get_refund',
  'list_transactions',
  'list_transaction',
] as const

export async function openPayPalReadTools(mcpUrl: string, accessToken: string) {
  const client = await createMCPClient({
    transport: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const all = await client.tools()
  const allowed = new Set<string>(PAYPAL_READ_ONLY_TOOLS)
  const tools = Object.fromEntries(Object.entries(all).filter(([name]) => allowed.has(name)))
  return { tools, toolNames: Object.keys(all), close: () => client.close() }
}
