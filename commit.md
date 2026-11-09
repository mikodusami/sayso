# Commit history to replay

Run these from the `sayso/` folder, top to bottom. Each pair is one snapshot.

```bash
git init -b main
git add package.json .nvmrc .gitignore LICENSE AGENTS.md commit.md tools/check-layers.mjs package-lock.json api/package.json web/package.json api/tsconfig.json api/vitest.config.ts api/drizzle.config.ts
git commit -m "chore: scaffold sayso workspace, layer rules and tooling" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/shared
git commit -m "feat(shared): config, errors, ids, money and clock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/domain api/test/support api/test/domain
git commit -m "feat(domain): mandates, guard checks, pre-capture check, fault rules and settlement states with tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/ports
git commit -m "feat(ports): interfaces for payments, AI, shopping agent, repositories, security and notifier" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/infrastructure/crypto api/src/infrastructure/notifier
git commit -m "feat(infra): AES-GCM secret box, signed link tokens, key hashing and signed outbound webhooks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/infrastructure/db api/drizzle api/drizzle.config.ts
git commit -m "feat(infra): drizzle schema, Postgres/PGlite client, repositories and first migration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/infrastructure/paypal
git commit -m "feat(infra): PayPal REST gateway, in-memory fake PayPal and read-only MCP tools" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/infrastructure/ai api/test/infrastructure
git commit -m "feat(infra): heuristic and AI Gateway adapters plus scripted and tool-loop shopping agents" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/features/_kit api/src/features/timeline api/src/shared/ids.ts
git commit -m "feat(features): route kit, timeline events and outbound webhook endpoints" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/features/catalog api/src/features/mandates
git commit -m "feat(features): catalog search and mandate parse, create, hosted approve and revoke" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/features/checks api/src/features/checkouts
git commit -m "feat(features): guard as a service, merchant verifier, PayPal order and check before capture" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/features/orders api/src/features/settlement api/src/features/findings
git commit -m "feat(features): orders with tracking, fault findings and refund-then-reimburse settlement" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/features/paypal-webhooks api/src/features/liabilities api/src/features/settings
git commit -m "feat(features): verified PayPal webhooks, agent-provider ledger and merchant settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/features/demo
git commit -m "feat(features): demo seed, sessions, reference agent toolbox and fake PayPal approval" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/http
git commit -m "feat(http): Hono app with request ids, CORS, authentication, idempotency and one error shape" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/src/app api/src/server.ts api/src/index.ts api/package.json api/src/infrastructure/db/repositories.ts
git commit -m "feat(app): composition root, local server and Vercel entry; sort products by numeric price" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/test/features
git commit -m "test: end-to-end API flows for every fault rule, the verifier, pre-capture checks and webhooks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/scripts api/.env.example
git commit -m "feat(scripts): migrate, seed with API keys, real PayPal sandbox smoke test and a CLI demo flow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add api/test/infrastructure/paypal-rest.test.ts
git commit -m "test: request shapes for the real PayPal REST adapter (orders, capture, refund, payout, webhooks)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add web/index.html web/public web/vite.config.ts web/tsconfig.json web/vercel.json web/.env.example web/src/lib web/src/components web/src/main.tsx web/src/styles.css web/src/features/home
git commit -m "feat(web): React + Vite shell, API client and shared UI pieces" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add web/src/features/approve web/src/features/pay
git commit -m "feat(web): hosted mandate approval and PayPal payment pages with fake PayPal stand-in" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add web/src/features/demo
git commit -m "feat(web): three-party demo console (shopper chat, merchant orders and findings, agent-provider ledger, timeline)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add README.md SETUP.md AGENTS.md api/.env.example api/src/shared/config.ts web/vite.config.ts
git commit -m "docs: README, SETUP checklist and demo script; run web on port 5180" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add commit.md
git commit -m "chore: record the commit history" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
