import { z } from 'zod'

// Development defaults. Never used when NODE_ENV=production (see loadConfig).
const DEV_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
const DEV_LINK_SECRET = 'dev-link-secret-change-me'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8787),
  PUBLIC_API_URL: z.url().default('http://localhost:8787'),
  WEB_ORIGIN: z.url().default('http://localhost:5180'),

  DATABASE_DRIVER: z.enum(['pglite', 'postgres']).default('pglite'),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('./.data/pglite'),

  PAYMENTS_DRIVER: z.enum(['fake', 'paypal']).default('fake'),
  PAYPAL_API_BASE: z.url().default('https://api-m.sandbox.paypal.com'),
  PAYPAL_MCP_URL: z.url().default('https://mcp.sandbox.paypal.com/http'),

  AI_DRIVER: z.enum(['heuristic', 'gateway']).default('heuristic'),
  AI_GATEWAY_API_KEY: z.string().optional(),
  AI_MODEL_FAST: z.string().default('anthropic/claude-haiku-5.5'),
  AI_MODEL_SMART: z.string().default('anthropic/claude-sonnet-5.5'),

  SAYSO_ENCRYPTION_KEY: z.string().optional(),
  SAYSO_LINK_SECRET: z.string().optional(),
  DEMO_ADMIN_TOKEN: z.string().default('dev-admin'),

  // Used only by the demo seed to create the two sandbox tenants.
  SEED_MERCHANT_PAYPAL_CLIENT_ID: z.string().optional(),
  SEED_MERCHANT_PAYPAL_SECRET: z.string().optional(),
  SEED_MERCHANT_WEBHOOK_ID: z.string().optional(),
  SEED_MERCHANT_PAYPAL_EMAIL: z.string().optional(),
  SEED_AGENT_PAYPAL_CLIENT_ID: z.string().optional(),
  SEED_AGENT_PAYPAL_SECRET: z.string().optional(),
  SEED_AGENT_WEBHOOK_ID: z.string().optional(),
})

export type Env = z.infer<typeof schema>

export interface Config {
  env: Env['NODE_ENV']
  port: number
  publicApiUrl: string
  webOrigin: string
  database: { driver: Env['DATABASE_DRIVER']; url?: string; pgliteDir: string }
  payments: { driver: Env['PAYMENTS_DRIVER']; apiBase: string; mcpUrl: string }
  ai: { driver: Env['AI_DRIVER']; fastModel: string; smartModel: string }
  secrets: { encryptionKey: string; linkSecret: string }
  demoAdminToken: string
  seed: {
    merchant: { clientId?: string; secret?: string; webhookId?: string; email?: string }
    agentProvider: { clientId?: string; secret?: string; webhookId?: string }
  }
}

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const env = schema.parse(source)
  const production = env.NODE_ENV === 'production'

  if (production && (!env.SAYSO_ENCRYPTION_KEY || !env.SAYSO_LINK_SECRET)) {
    throw new Error('SAYSO_ENCRYPTION_KEY and SAYSO_LINK_SECRET are required in production')
  }
  if (env.DATABASE_DRIVER === 'postgres' && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when DATABASE_DRIVER=postgres')
  }
  if (env.AI_DRIVER === 'gateway' && !env.AI_GATEWAY_API_KEY && !source.VERCEL_OIDC_TOKEN) {
    throw new Error('AI_GATEWAY_API_KEY is required when AI_DRIVER=gateway (or deploy on Vercel with OIDC)')
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    publicApiUrl: env.PUBLIC_API_URL,
    webOrigin: env.WEB_ORIGIN,
    database: { driver: env.DATABASE_DRIVER, url: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR },
    payments: { driver: env.PAYMENTS_DRIVER, apiBase: env.PAYPAL_API_BASE, mcpUrl: env.PAYPAL_MCP_URL },
    ai: { driver: env.AI_DRIVER, fastModel: env.AI_MODEL_FAST, smartModel: env.AI_MODEL_SMART },
    secrets: {
      encryptionKey: env.SAYSO_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
      linkSecret: env.SAYSO_LINK_SECRET ?? DEV_LINK_SECRET,
    },
    demoAdminToken: env.DEMO_ADMIN_TOKEN,
    seed: {
      merchant: {
        clientId: env.SEED_MERCHANT_PAYPAL_CLIENT_ID,
        secret: env.SEED_MERCHANT_PAYPAL_SECRET,
        webhookId: env.SEED_MERCHANT_WEBHOOK_ID,
        email: env.SEED_MERCHANT_PAYPAL_EMAIL,
      },
      agentProvider: {
        clientId: env.SEED_AGENT_PAYPAL_CLIENT_ID,
        secret: env.SEED_AGENT_PAYPAL_SECRET,
        webhookId: env.SEED_AGENT_WEBHOOK_ID,
      },
    },
  }
}
