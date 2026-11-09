import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { schema } from './schema'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export interface Database {
  db: Db
  driver: 'pglite' | 'postgres'
  migrate(): Promise<void>
  close(): Promise<void>
}

export const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')

export interface DatabaseOptions {
  driver: 'pglite' | 'postgres'
  url?: string
  /** PGlite data folder, or "memory://" for an in-memory database. */
  pgliteDir?: string
}

/** Opens Postgres (Neon in production) or PGlite (local and tests). Both use the same schema. */
export async function openDatabase(options: DatabaseOptions): Promise<Database> {
  if (options.driver === 'postgres') {
    if (!options.url) throw new Error('DATABASE_URL is required for the postgres driver')
    const { default: postgres } = await import('postgres')
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')
    const client = postgres(options.url, { max: 5, prepare: false })
    const db = drizzle({ client, schema, casing: 'snake_case' })
    return {
      db: db as unknown as Db,
      driver: 'postgres',
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
      close: () => client.end(),
    }
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const dir = options.pgliteDir ?? 'memory://'
  if (!dir.startsWith('memory://')) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(dir, { recursive: true })
  }
  const client = new PGlite(dir)
  const db = drizzle({ client, schema, casing: 'snake_case' })
  return {
    db: db as unknown as Db,
    driver: 'pglite',
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => client.close(),
  }
}
