import { defineConfig } from 'drizzle-kit'

// Generates SQL migrations from the schema. Applying them is done by
// scripts/migrate.ts (Postgres) or automatically at startup (PGlite).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
})
