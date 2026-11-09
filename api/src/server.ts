// Local entry point: `npm run dev` (watches) or `npm start`.
import { serve } from '@hono/node-server'
import { buildContainer } from './app/container'
import { loadConfig } from './shared'

const config = loadConfig()
const container = await buildContainer(config)

serve({ fetch: container.app.fetch, port: config.port }, (info) => {
  console.log(`Sayso API on http://localhost:${info.port}`)
  console.log(`  payments=${config.payments.driver} ai=${config.ai.driver} database=${config.database.driver}`)
  console.log(`  web console: ${config.webOrigin}/demo`)
})

const shutdown = async () => {
  await container.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
