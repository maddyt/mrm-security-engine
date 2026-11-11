# MRM Security Engine

A model risk and security compliance adapter for US bank regulation. It takes what a scorecard platform already produces (model metadata, KS / Gini / AUC, a SHAP importance vector) through an open JSON contract and returns an examiner-ready package: an SR 11-7 validation binder, ECOA / Regulation B fair lending tests, population drift monitoring, adversarial threat tests, and a tamper-evident audit ledger.

Built from the *Enterprise AI Model Risk Management (MRM) & Security Compliance Engine* PRD as a demonstration adapter for Corestrat's ModelCompass.ai and IntelliDecision.ai. It was built independently, with no access to Corestrat code or specifications.

> **Demonstration build.** The portfolio is synthetic. See [What is real and what is simulated](#what-is-real-and-what-is-simulated).

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. No configuration is needed.

## Deploy on Vercel

1. Import this repository as a new Vercel project. The defaults (Next.js) are correct.
2. Create a Supabase project, open the SQL editor and run `supabase/migrations/0001_mrm_ledger.sql`.
3. In Vercel → Settings → Environment Variables add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` secret key |
| `MRM_JWT_SECRET` | Any long random string |

4. Redeploy, open **Audit Ledger** and confirm the store reads "Supabase Postgres (persistent)".

Supabase is optional locally but matters on Vercel: without it the ledger is held in server memory, and separate serverless instances each have their own copy.

## The portal

| Page | What it shows |
|---|---|
| Overview `/mrm` | Model inventory with pass / monitor / action status, and a one-click run of the four-stage validation with real timings |
| Ingest & Gateway | Send a payload in the contract format; token, role, schema, hash and ledger checks |
| Performance & XAI | KS, Gini, AUC, calibration to the PDO scale, SHAP attribution, the scorecard itself |
| Fair Lending | Disparate impact ratio by group against the four-fifths rule, a cut-off slider, driver decomposition, less-discriminatory-alternative search, adverse action reasons |
| Drift & Stability | PSI and CSI with the 0.10 / 0.25 bands, monthly trend, a what-if severity slider |
| Security & Threats | Income padding, model extraction and prompt injection tests, OWASP LLM Top 10 coverage |
| Audit Binder | The SR 11-7 validation report as PDF (print) or Markdown, with independent sign-off |
| Audit Ledger | Hash-chained blocks, verified in the browser, with a tamper simulation |
| Help & Docs | Demo script, page guides, glossary, regulatory mapping, FAQ |

Every metric has a "?" definition and every page has a "How to use this page" guide.

## API

All routes except the token issuer and the OpenAPI document require a Bearer token.

| Route | Purpose | Entitlement |
|---|---|---|
| `POST /api/v1/mrm/token` | Demo identity provider: a signed token for a role | none |
| `POST /api/v1/mrm/ingest` | Validate, hash and ledger a payload | `model:ingest` |
| `POST /api/v1/mrm/audit-binder/generate` | Run validation and return the binder | `binder:generate` |
| `POST /api/v1/mrm/signoff` | Record the validator's decision | `validation:signoff` |
| `GET /api/v1/mrm/ledger` | Read the audit ledger | `ledger:read` |
| `GET /api/v1/mrm/openapi.json` | OpenAPI 3 document | none |

Roles: `Model_Developer` (ingest, run), `Independent_Validator` (run, sign off), `Executive_Auditor` (binders and ledger only).

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/v1/mrm/token -H 'content-type: application/json' -d '{"role":"Model_Developer"}' | jq -r .access_token)
```

```bash
curl -s -X POST localhost:3000/api/v1/mrm/ingest -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d @payload.json
```

## How it is built

| Path | Contents |
|---|---|
| `src/lib/mrm/engine.ts` | Seeded applicant simulator, Weight-of-Evidence logistic scorecard, KS / Gini / AUC, SHAP, disparate impact, alternative search, PSI / CSI |
| `src/lib/mrm/threats.ts` | Threat matrix, perturbation and extraction tests, prompt guard, OWASP coverage |
| `src/lib/mrm/binder.ts` | The six-section binder as structured blocks and Markdown |
| `src/lib/mrm/contract.ts` | Zod contract, threshold checks, roles, OpenAPI |
| `src/lib/mrm/chain.ts` | Canonical JSON, SHA-256, block sealing and chain verification (runs in browser and server) |
| `src/lib/mrm/server/` | Token signing and verification, the request guard, the ledger store |
| `src/lib/mrm/help.ts` | Glossary, page guides, FAQ, demo script |
| `src/components/mrm/`, `src/app/mrm/` | Shell, chart kit and pages |

The engine is pure TypeScript and deterministic, so the browser, the API and the binder agree exactly. No language model writes any part of the binder: the same payload always gives the same report and hash.

The three inventory models tell three stories. The personal loan scorecard fails the four-fifths test through a ZIP-level proxy, and the engine finds the fix. The card scorecard is clean. The auto scorecard has drifted past PSI 0.25.

## What is real and what is simulated

**Real, computed live:** the scorecard fit and every statistic; the contract, schema validation and OpenAPI document; signed tokens and role checks on every route; SHA-256 hashing and the chained ledger; the prompt guard and output filter; the binder.

**Simulated:** the applicants (generated from a fixed seed; the fair lending failure and the drift are designed in so there is something to catch); the attacker in the security tests; the identity provider (a demo issuer gives a token for any role); mutual TLS (specified, not enforceable on a public demo host); API rate limiting (modelled in the extraction test, not enforced); any call into a Corestrat system.

The contract follows the field names in the PRD. It has not been checked against a published ModelCompass.ai schema. The four-fifths ratio is a screening threshold; nothing here is legal advice.

## Checks

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```
