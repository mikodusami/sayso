# AGENTS.md

How this codebase is organised and the rules for changing it. Read this before
editing anything. Humans: this is also the architecture guide.

## What Sayso is

A B2B API. Merchants and AI-agent providers call it. A shopper signs a
**mandate** (what an agent may buy). Every PayPal order made under it carries
the mandate's **fingerprint**. When a purchase goes wrong, fixed **fault rules**
decide who is responsible, and **settlement** fixes it through PayPal refunds
and payouts. Specs live in `../wiki` (`/idea`, `/idea/product`, `/idea/technical`).

Two rules matter more than any other:

1. **AI reads, code moves money.** AI may parse text, judge fuzzy matches and
   sort complaints. Only deterministic code creates orders, captures, refunds
   or sends payouts.
2. **The API is the product.** Every capability must be reachable through
   `/v1`. The web app only shows what the API does.

## Repository layout

```
sayso/
  api/            the product (Hono, Node 24, TypeScript)
  web/            thin React + Vite client (hosted pages + demo console)
  tools/          repo scripts (layer checker)
  AGENTS.md       this file
  SETUP.md        what a human must do (accounts, keys, deploy)
  commit.md       git commands to replay the history
```

## API layers

Build and depend **downwards only**. A layer may import from layers below it,
never from layers above it or beside it (except where stated).

```
  7  entry           src/index.ts (Vercel), src/server.ts (local)
  6  app             src/app/        composition root: wires everything
  5  http            src/http/       Hono app, middleware, error mapping
  4  features        src/features/   use cases + routes, one folder per feature
  3  infrastructure  src/infrastructure/   adapters that implement ports
  2  ports           src/ports/      interfaces for anything outside the domain
  1  domain          src/domain/     pure business logic, no I/O
  0  shared          src/shared/     config, errors, ids, money, clock
```

| Layer | May import | Must not import |
| --- | --- | --- |
| shared | `zod`, node built-ins | anything in `src/` |
| domain | shared, `zod`, `canonicalize`, `node:crypto` | ports, infrastructure, features, http, app |
| ports | domain, shared | infrastructure, features, http, app |
| infrastructure | ports, domain, shared, vendor SDKs | features, http, app |
| features | ports, domain, shared, `hono`, other features' `index.ts` only | infrastructure, app |
| http | features (index only), ports, shared, `hono` | infrastructure, app |
| app | everything | — |

`npm run check:layers` enforces this table. Run it before every commit.

### Why these layers

- **domain** holds the rules we must be able to prove: mandate fingerprints,
  guard checks, fault rules, settlement steps, the check before capture. It has
  no network or database code, so it is fast to test and easy to read.
- **ports** describe what the app needs from the outside world
  (`PaymentsGateway`, `AiService`, `ShoppingAgent`, `Repositories`,
  `SecretBox`, `TokenSigner`, `EventNotifier`) without saying how.
- **infrastructure** says how. Each port has a real adapter and, where useful,
  a local one:
  - payments: `RestPaymentsGateway` (PayPal sandbox) and `FakePaymentsGateway`
  - AI: `GatewayAiService` (Vercel AI Gateway) and `HeuristicAiService`
  - database: Drizzle on Postgres (Neon) or PGlite (local file or memory)
  The `*_DRIVER` env vars choose which. This is why the whole app runs with no
  accounts at all.
- **features** are the use cases. They receive their dependencies through a
  `create...Service(deps)` factory and never construct adapters themselves.
- **app** (`container.ts`) is the only place that knows which adapter is used.

## Features

Each folder in `src/features/` is one capability:

| Feature | Owns |
| --- | --- |
| `timeline` | recording events (with PayPal IDs) and sending them to tenant webhooks |
| `catalog` | merchant products and product search |
| `mandates` | parse, create, approve (hosted), revoke |
| `checks` | the guard as a service (`POST /v1/checks`) and the shared candidate evaluator |
| `checkouts` | merchant verifier, PayPal order, check before capture, capture |
| `orders` | Asked / Bought / Shipped view, shipments and PayPal tracking |
| `findings` | complaints, fault findings, appeals |
| `settlement` | confirm → refund → reimbursement payout |
| `paypal-webhooks` | verify, de-duplicate and route incoming PayPal events |
| `liabilities` | the agent provider's ledger |
| `settings` | merchant settings |
| `demo` | seed/reset, demo sessions, reference agent, fake PayPal controls |

A feature folder normally contains:

```
features/<name>/
  service.ts    use cases; exports create<Name>Service(deps) and its type
  routes.ts     Hono routes; validates input, calls the service, presents output
  schemas.ts    zod request schemas (and response presenters if needed)
  index.ts      the feature's public surface - the only file others import
```

Rules for features:

- Talk to the outside world only through ports passed in `deps`.
- Use another feature only through its `index.ts`, and receive its service
  through `deps` (the container passes it in). Never import another feature's
  `service.ts` or `routes.ts` directly.
- Put any rule worth testing in `domain/`, not in the service.
- Every state change writes a timeline event.

## Conventions

- **Money** is a string with two decimals (`"118.00"`), as PayPal sends it.
  Use `shared/money.ts` for maths (whole cents). Never use floating point.
- **IDs** have prefixes (`mdt_`, `chk_`, `fnd_`...) from `shared/ids.ts`.
- **Errors**: throw `AppError` (`shared/errors.ts`). The HTTP layer maps it to
  `{ "error": { "type", "message", ... } }`.
- **Idempotency**: PayPal money calls always send a request ID built from a
  Sayso ID. Sayso POSTs accept an `Idempotency-Key` header.
- **No secrets in the browser.** The web app uses demo sessions and hosted
  link tokens, never `sk_` keys.
- **Imports** are extensionless (bundler resolution). No path aliases.
- **Tests**: domain rules have unit tests in `api/test/domain`. End-to-end
  flows run against fakes and in-memory PGlite in `api/test/features`.

## Commands

```
npm install                 install both workspaces
npm run dev                 api on :8787 and web on :5180 (fakes by default)
npm test                    api tests
npm run check               layers + typecheck + tests
npm run db:generate -w api  create a migration after changing db/schema.ts
npm run db:migrate -w api   apply migrations to DATABASE_URL
npm run seed -w api         create the demo tenants, agents and products
npm run smoke -w api        real PayPal sandbox smoke test (needs credentials)
```

## Commits

Do not run `git commit`. Append the commands to `commit.md` instead, one
`git add` line and one `git commit` line per snapshot, in order.
