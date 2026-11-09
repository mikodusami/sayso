# Sayso

**Proof of what you asked your AI agent to buy, and the right party pays when it gets it wrong.**

AI agents can now shop at PayPal merchants. When one buys the wrong thing, there is no record of
what the shopper actually asked for, so the merchant usually absorbs the refund. Sayso is an API
for merchants and agent providers that:

1. turns a shopper's request into a short, signed **mandate** (item, must-match details, maximum
   total, deadline, allowed agents) and fingerprints it;
2. **checks every candidate** against the mandate, with hard limits in code and AI only for fuzzy
   details like "is charcoal grey?". This runs in the agent (guard) and again at the merchant
   (verifier), which can block or flag;
3. creates the **PayPal order carrying the fingerprint**, and **checks again just before capture**
   (amount, payer, mandate);
4. when a shopper complains, compares *what was asked*, *what was bought* and *what was shipped*,
   and **fixed rules (R1–R9) decide who is at fault**;
5. **settles it on PayPal**: a refund to the shopper, then a PayPal payout from the agent provider
   to the merchant when the agent was at fault.

AI reads; code moves money.

## Quick start

```bash
npm install
npm run dev                 # API :8787 + web :5180, no accounts needed (fake PayPal, heuristic AI)
open http://localhost:5180/demo
npm run check               # layer rules, typecheck, 87 tests
npm run demo:flow -w api    # the full story in the terminal
```

Real PayPal sandbox, AI Gateway, Neon and deployment: see [SETUP.md](SETUP.md).

## How it's built

```
api/   Hono API service (the product)       web/   React + Vite thin client
  src/shared          config, errors, ids, money
  src/domain          pure rules: mandate, guard, pre-capture, fault rules, settlement
  src/ports           interfaces: payments, AI, agent, repositories, security, notifier
  src/infrastructure  PayPal REST + fake, AI Gateway + heuristic, Drizzle (Neon/PGlite)
  src/features        one folder per capability (mandates, checks, checkouts, findings, …)
  src/http            Hono app, auth, idempotency, errors
  src/app             composition root (the only place adapters are chosen)
```

Layers depend downwards only, enforced by `npm run check:layers`. See [AGENTS.md](AGENTS.md).

## PayPal pieces used

| Sayso step | PayPal |
| --- | --- |
| Checkout | Orders v2 create / get / capture; fingerprint in `custom_id`; `PayPal-Request-Id` idempotency |
| Shopper approval | PayPal JavaScript SDK buttons (`@paypal/react-paypal-js`) |
| Delivery record | Orders v2 tracking (`/v2/checkout/orders/{id}/track`) with the shipped SKU |
| Refund | Payments v2 captures refund |
| Agent provider repays merchant | Payouts v1 from the agent provider's account |
| Events | Webhooks, signature-verified via `verify-webhook-signature`, de-duplicated |
| Disputes | `CUSTOMER.DISPUTE.CREATED` becomes a Sayso finding |
| AI reading PayPal data | PayPal MCP server (read-only tool allowlist) |

## AI used

Vercel AI SDK 7 through the Vercel AI Gateway (`anthropic/claude-haiku-5.5` for parsing, fuzzy
checks and complaint sorting; `anthropic/claude-sonnet-5.5` for the reference shopping agent in a
`ToolLoopAgent`). Every AI output is schema-validated and feeds deterministic code. The AI has
no tools that capture, refund or pay out.

## API at a glance

```bash
API=http://localhost:8787
AGENT_KEY=sk_test_agent_…   # from: npm run seed -w api
MERCH_KEY=sk_test_merch_…

# Agent provider: draft -> mandate (send the shopper approval_url)
curl -s $API/v1/mandates/parse -H "Authorization: Bearer $AGENT_KEY" -H 'content-type: application/json' \
  -d '{"text":"trail running shoes, size 10, grey, under $120 including shipping"}'
curl -s $API/v1/mandates -H "Authorization: Bearer $AGENT_KEY" -H 'content-type: application/json' \
  -d '{"shopper_ref":"maya","draft":{…draft from above…}}'

# Guard, then checkout (merchant verifier runs on it; returns pay_url for the shopper)
curl -s $API/v1/checks -H "Authorization: Bearer $AGENT_KEY" -H 'content-type: application/json' \
  -d '{"mandate_id":"mdt_…","agent_id":"agt_careful","merchant_id":"ten_trailhead","sku":"RTR-GRY-10"}'
curl -s $API/v1/checkouts -H "Authorization: Bearer $AGENT_KEY" -H 'content-type: application/json' \
  -H 'Idempotency-Key: order-1' \
  -d '{"mandate_id":"mdt_…","agent_id":"agt_careful","merchant_id":"ten_trailhead","sku":"RTR-GRY-10"}'

# Merchant: orders, ship, findings, confirm
curl -s $API/v1/orders -H "Authorization: Bearer $MERCH_KEY"
curl -s $API/v1/findings -H "Authorization: Bearer $MERCH_KEY"
curl -s -X POST $API/v1/findings/fnd_…/confirm -H "Authorization: Bearer $MERCH_KEY"
```

The full route list is at `GET /v1`.

## License

MIT. Businesses and people in the demo (Trailhead Running Co., QuickCart, Maya) are fictional.
Sandbox only; no real money moves.
