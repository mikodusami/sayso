// Enforces the layer rules in AGENTS.md for api/src.
// Usage: node tools/check-layers.mjs   (exit code 1 on violations)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'api', 'src')

// layer -> layers it may import (besides itself)
const allowed = {
  shared: [],
  domain: ['shared'],
  ports: ['domain', 'shared'],
  infrastructure: ['ports', 'domain', 'shared'],
  features: ['ports', 'domain', 'shared'],
  http: ['features', 'ports', 'shared', 'domain'],
  app: ['shared', 'domain', 'ports', 'infrastructure', 'features', 'http'],
  entry: ['app', 'shared', 'http'],
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

function layerOf(path) {
  const top = relative(root, path).split(sep)[0]
  return top in allowed ? top : 'entry'
}

const violations = []
const importRe = /(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/g

for (const file of files(root)) {
  const from = layerOf(file)
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(importRe)) {
    const target = resolve(dirname(file), match[1])
    const to = layerOf(target)
    const where = relative(root, file)

    if (to !== from && !allowed[from].includes(to)) {
      violations.push(`${where}: ${from} must not import ${to} (${match[1]})`)
      continue
    }

    // Features (and http) may only use another feature through its index.
    if (to === 'features') {
      const [, targetFeature, ...rest] = relative(root, target).split(sep)
      const ownFeature = from === 'features' ? relative(root, file).split(sep)[1] : null
      const viaIndex = rest.length === 0 || (rest.length === 1 && rest[0] === 'index')
      if (targetFeature !== ownFeature && !viaIndex) {
        violations.push(`${where}: import feature "${targetFeature}" through its index only (${match[1]})`)
      }
    }
  }
}

if (violations.length) {
  console.error(`Layer check failed (${violations.length}):\n  ` + violations.join('\n  '))
  process.exit(1)
}
console.log('Layer check passed.')
