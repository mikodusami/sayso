// Applies drizzle/ migrations to DATABASE_URL (Neon) or the local PGlite folder.
// Usage: npm run db:migrate -w api
import { openDatabase } from '../src/infrastructure/db'
import { loadConfig } from '../src/shared'

const config = loadConfig()
const db = await openDatabase({ driver: config.database.driver, url: config.database.url, pgliteDir: config.database.pgliteDir })
await db.migrate()
await db.close()
console.log(`Migrations applied (${config.database.driver}).`)
