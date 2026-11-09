# SETUP: what's done, and what only you can do

Deadline: **Thursday, November 12, 2026, 12:00 p.m. PST**. Aim to submit by 11:00 a.m.

## 1. What is already built

- [x] API: mandates, guard checks, merchant verifier (block/flag), PayPal order with the
      mandate fingerprint, check before capture, capture, tracking, complaints, fault rules
      R1–R9, refund then reimbursement payout, PayPal webhooks, ledger, settings, outgoing
      signed webhooks, idempotency, one error shape
- [x] Real PayPal sandbox adapter (REST) and a fake PayPal that follows the same rules
- [x] Real AI adapter (Vercel AI Gateway) and an offline heuristic one
- [x] Reference shopping agent: scripted (offline) and tool-loop (AI Gateway)
- [x] Database: Postgres (Neon) or PGlite, one schema, one migration
- [x] Web: hosted approval page, hosted PayPal payment page, three-party demo console
- [x] 87 tests: every fault rule, every guard check, the pre-capture check, full API flows
- [x] Scripts: `migrate`, `seed` (prints API keys), `smoke` (real PayPal), `demo:flow` (CLI demo)

## 2. Run it now (no accounts needed)

```bash
cd sayso
npm install
npm run dev            # API on :8787, web on :5180 (fake PayPal, heuristic AI, local PGlite)
```

Open http://localhost:5180/demo and follow the demo script in section 5.

```bash
npm run check          # layer rules + typecheck + tests
npm run demo:flow -w api   # the whole story in the terminal
```

## 3. What only you can do (in this order)

### A. Put it on GitHub (10 min)
1. From `sayso/`, run the commands in `commit.md` top to bottom.
2. Create a **public** GitHub repo, then `git remote add origin …` and `git push -u origin main`.
3. Check that the MIT license shows in the repo's About box.

### B. PayPal sandbox (30 min) - developer.paypal.com
1. **Sandbox accounts** (Testing Tools → Sandbox Accounts). Create:
   - a **Business** account for *Trailhead Running Co.* (merchant)
   - a **Business** account for *QuickCart* (agent provider)
   - a **Personal** account for *Maya* (buyer), plus one more Personal account for the payer-mismatch test
2. **REST apps** (Apps & Credentials → Sandbox → Create App):
   - `sayso-merchant`, linked to the Trailhead business account
   - `sayso-agent-provider`, linked to the QuickCart business account, with **Payouts** enabled
3. Copy into `api/.env` (start from `api/.env.example`):
   ```
   PAYMENTS_DRIVER=paypal
   SEED_MERCHANT_PAYPAL_CLIENT_ID=…      SEED_MERCHANT_PAYPAL_SECRET=…
   SEED_MERCHANT_PAYPAL_EMAIL=<Trailhead sandbox business email>
   SEED_AGENT_PAYPAL_CLIENT_ID=…         SEED_AGENT_PAYPAL_SECRET=…
   ```
4. Run `npm run smoke -w api`. It logs in, creates a $1 order, sends a $1 payout and lists
   the MCP tools. Open the approval link it prints, log in as Maya, approve, then run the
   `capture` command it prints. You should see a capture and a refund.
   - If the payout fails, Payouts isn't enabled on the agent-provider app. Fix it in the dashboard.
     If it still fails, tell Claude to build the invoice fallback (section 4).
5. In `web/.env.local`, nothing extra is needed: the pay page gets the merchant's public client ID from the API.

### C. AI Gateway key (5 min) - vercel.com → AI Gateway → API keys
```
AI_DRIVER=gateway
AI_GATEWAY_API_KEY=…
```
Then retry the demo chat. If the model behaves oddly, set `AI_DRIVER=heuristic` and the demo still works.

### D. Database for the deployed version (10 min)
1. Vercel → Storage / Marketplace → **Neon** → create a database → copy `DATABASE_URL`.
2. In `api/.env`: `DATABASE_DRIVER=postgres` and `DATABASE_URL=…`.
3. Run `npm run db:migrate -w api`, then `npm run seed -w api`. **Save the two API keys it
   prints.** They are shown only once (re-running the seed issues new ones).

### E. Deploy (20 min) - two Vercel projects from the same repo
| Project | Root directory | Framework | Environment variables |
| --- | --- | --- | --- |
| `sayso-api` | `api` | Hono | everything from `api/.env`, plus `NODE_ENV=production`, `SAYSO_ENCRYPTION_KEY` and `SAYSO_LINK_SECRET` (each `openssl rand -base64 32`), `DEMO_ADMIN_TOKEN` (pick one), `WEB_ORIGIN=https://<web url>`, `PUBLIC_API_URL=https://<api url>` |
| `sayso-web` | `web` | Vite | `VITE_API_URL=https://<api url>` |

- Use `PAYMENTS_DRIVER=paypal` on Vercel. The fake PayPal keeps its state in memory, which serverless instances don't share.
- After the first deploy, set `WEB_ORIGIN` and `PUBLIC_API_URL` to the real URLs and redeploy the API.
- **Important:** run `npm run seed -w api` locally against the Neon `DATABASE_URL` using the **same
  `SAYSO_ENCRYPTION_KEY` as production**, otherwise the stored PayPal secrets can't be decrypted.
- Check: `https://<api url>/health` shows `"payments":"paypal"`, and `https://<web url>/demo` loads.

### F. PayPal webhooks (10 min)
1. On each sandbox REST app → Webhooks → Add webhook. Use the URLs the seed printed:
   - merchant app: `https://<api url>/v1/paypal/webhooks/ten_trailhead`, with events
     `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.CREATED`
   - agent-provider app: `https://<api url>/v1/paypal/webhooks/ten_quickcart`, with events
     `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED`, `PAYMENT.PAYOUTSBATCH.SUCCESS`
2. Copy each **Webhook ID** into `SEED_MERCHANT_WEBHOOK_ID` / `SEED_AGENT_WEBHOOK_ID` (locally and on Vercel), then re-run the seed.
3. Optional: log in to sandbox.paypal.com as Maya and open a dispute on a paid order. It can take a while to arrive.

### G. Submit
1. Record the video (under 3 minutes, section 5) and upload it to YouTube as **public**.
2. On Devpost: description, the repo link, the hosted web URL, the video, and these judge instructions:
   *"Open `<web url>/demo`. Pay with the sandbox buyer `<Maya's sandbox email>` / `<password>`."*
3. Keep the PayPal apps, Neon, the AI key and both Vercel projects running until **December 15**.

## 4. Optional work left (P1), in order of value

1. **OpenAPI document** at `/v1/openapi.json` (opens the APIMatic sponsor prize). The route
   schemas are already zod, so `@hono/zod-openapi` can generate it.
2. **Invoice fallback** when sandbox payouts are denied (spec F-7).
3. **Merchant "ask about this order"** using PayPal's MCP server. The adapter is ready:
   `api/src/infrastructure/paypal/mcp.ts` (`openPayPalReadTools`). It needs a route plus a
   `ToolLoopAgent` with those read-only tools.
4. **Passkey signing** of mandates (spec M-6). The fingerprint is already the challenge to sign.
5. **Webhook retries** with backoff for outgoing Sayso events.

## 5. The 3-minute demo script (matches the code)

| Time | Do this at `/demo` | Shows |
| --- | --- | --- |
| 0:00 | Say the hook: "When an agent buys the wrong thing, the merchant pays. Sayso fixes that." | Problem |
| 0:15 | Send the prefilled request. The agent asks *"Is $120.00 your limit including shipping and tax?"* Click **Yes, including shipping**. | Ask, don't guess |
| 0:35 | Mandate card appears with its fingerprint. Click **Open approval page**, then approve. | Hosted consent |
| 0:50 | Click **Go ahead**. Five shoes fail with reasons ($129 over limit, navy, size 9, 10.5, arrives late). It picks the **Charcoal** pair at $112.00, marked "AI judgement". | The guard |
| 1:10 | Open Maya's pay page and pay with PayPal (sandbox). The timeline shows the PayPal order and capture IDs. | PayPal + fingerprint |
| 1:30 | Merchant column: open the order (Asked / Bought / Shipped), ship it, mark delivered. | Merchant view |
| 1:45 | On the pay page: "These are charcoal, not grey." → **Rule R7: agent at fault.** | Fault rules |
| 2:00 | Merchant clicks **Confirm refund**: refund ID, then the payout from QuickCart. The ledger shows $112.00 repaid. | The agent pays, not the merchant |
| 2:20 | Start a new task. Use **Let QuickCart Turbo buy it** with size 9: **blocked**. Switch the verifier to flag and try again: flagged, and Maya must accept a warning to pay. | Careless agents |
| 2:45 | Close: "Agents can already pay. Sayso makes sure the right party pays when they get it wrong." | Close |

Agent fault in the demo is **R7** (the agent's judgement call). R6, an unwarned out-of-mandate order,
can't be reached through Sayso's hosted pay page, because the page always makes the shopper accept
warnings first, which is R5. R6 is there for agents that pay by other routes, and the tests cover it.

## 6. Troubleshooting

- **The web app says it can't reach the API.** Start the API (`npm run dev:api`) and check `web/.env.local`, which defaults to `http://localhost:8787`.
- **CORS error.** `WEB_ORIGIN` in the API env must exactly match the web URL.
- **`PayPal login failed`.** Wrong client ID or secret, or a live app instead of a sandbox app.
- **Pay page shows the fake button in paypal mode.** The merchant tenant has no PayPal credentials. Re-run the seed with the `SEED_MERCHANT_*` vars set.
- **To start over locally,** delete `api/.data/` (or use **Reset demo** with the admin token).
