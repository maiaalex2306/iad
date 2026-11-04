# IaD Revenue Intelligence — Phased Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely add a supervised, high-performance B2B revenue automation layer to the existing IaD CRM; start with a deterministic, testable authorization and dry-run core, and release additional capabilities only after independent gates.

**Architecture:** Keep the existing local-first CRM, the production Supabase business database, RLS and CAS logic. Run expensive discovery, enrichment, cadence scheduling and language-model inference server-side using bounded workers and a durable queue. An isolated action gateway validates policy, a bound human approval, live suppression, current revision and provider eligibility before any external side effect.

**Tech Stack:** Existing vanilla JavaScript PWA, Node.js 22 test runner, Supabase/PostgreSQL 17, Deno Edge Functions, existing IMAP/SMTP and Meta webhook adapters. Proposed pgmq/Cron, not installed or enabled yet. No new mandatory frontend framework or runtime dependency in the initial phase.

**Spec:** `docs/superpowers/specs/2026-11-04-iad-revenue-intelligence-design.md`

## Global Constraints
- Active application base: `claude/decisoes-estagios-vendas-eckjo0`, verified at SHA `6099d3bec9901e6eedeeee74aeb71821c784244a`, version `v286.45`. GitHub default `main` is not the application baseline.
- Production database ID `drhonmdffhnwamwzynrs`; **no production SQL, schema changes, sends or data modifications without later release authorization.**
- Preserve current CAS offline journal, receipts, local/remote revisions, all eight commercial decision rules and any unresolved browser-specific conflicts.
- No mass outreach, no provider calls, no automatic CRM mutation while feature is disabled. All outreach starts as dry run, with explicit human approval bound to campaign, audience, channel and message hash.
- Enforce tenant, owner/actor, role, contact permission, suppressions, opt-out, replies and provider rules at the server boundary; model-generated text cannot grant permission.
- The PWA never holds LLM API secrets, service-role keys or provider credentials; new backend components must never log them.
- No unauthorized social scraping or messaging; use only allowed official APIs and consent/lawful-basis checks.
- Any field-level change in an opportunity needs existing CAS/decision-engine semantics, not a direct upsert.
- No changes to `src/config.js`, `sw.js`, pipeline rendering or existing UI in phase RI-00. No change to the public URL or rollout flags.
- Use deterministic pure components to minimize latency; do not add browser blocking calls. Version release and the public deployment require a separate gate.

## Review Focus
- Cross-tenant or mismatched user/action/recipient IDs → deny; Task 1 test `denies identity mismatch`.
- Revoked/expired/modified approval → deny even if policy previously returned allow; Task 1 test `blocks expired and revoked approvals`.
- Recipient has replied, opted out, bounced or lacks lawful eligibility → deny; Task 1 test `stops on suppression and replies`.
- Repeated trigger or stale duplicate action → stable canonical fingerprint; Task 2 test `same intent gets same idempotency key`; Task 3 test `dry-run never sends`.
- Provider unavailable or action outside approved channel/schedule/cap → deny; Task 1 tests `enforces provider and quotas` and `enforces time window`.

---

# Release roadmap and independent subprojects

| Phase | Deliverable | Depends on | Release gate |
|---|---|---|---|
| RI-00 | Policy-only module, canonical intent, zero-side-effect dry-run, regression CI | Active app baseline | Tests green; no DB or runtime change |
| RI-01 | Read-only intelligence workspace; account briefing with evidence and explicit uncertainty | RI-00 | Browser performance parity and RLS/tenant tests |
| RI-02 | Region/segment/ICP discovery, dedupe, provenance, contact matching | RI-01 | Provider compliance, dedupe, data accuracy, QA samples |
| RI-03 | Approval panel, campaign policies, privileged action gateway, durable worker/queue | RI-00 + RI-02 | CAS+RLS+retries+idempotency load tests; DRY RUN |
| RI-04 | Authorized email outreach, inbox interpretation and automatic reply pausing | RI-03 | Email canary opt-in; delivery reconciliation, opt-out proof |
| RI-05 | Official outbound WhatsApp if eligible, LinkedIn permitted tasks, supervised follow-up | RI-03 + provider approvals | Channel-specific policy verification |
| RI-06 | Suggested safe CRM mutations, stage/financial approvals, audit and conflict resolution | RI-03 | Existing decision engine and CAS E2E green |
| RI-07 | Learning loop, cohort conversion, cost/performance dashboards and phased rollout | RI-04–06 | A/B controlled pilots, cost/safety/performance SLOs |

Each RI-01..RI-07 is a separately specifiable subproject and must receive its own detailed plan after the preceding interface is proven; do not implement them blindly from this table.

# RI-00 detailed test-driven tasks

### Task 1: Deterministic server-side dispatch policy

**Files:**
- Create: `nuvem/revenue-intelligence/dispatch-policy.mjs`
- Test: `scripts/ri-dispatch-policy.test.cjs`

**Interfaces:**
- Consumes: JSON input `{context, campaign, approval, recipient, action, provider}`. `context = {tenantId,actorId,now,role}`; `campaign={id,tenantId,state,channel,paused}`; `approval={tenantId,campaignId,state,channel,audienceHash,contentHash,expiresAt,revokedAt}`; `recipient={id,tenantId,optedOut,replied,bounced,lawfulBasisVerified}`; `action={tenantId,campaignId,recipientId,channel,audienceHash,contentHash,idempotencyKey,alreadyDispatched,sendCount,limit}`; `provider={enabled,channel}`.
- Produces: `authorizeDispatch(input): {allowed:boolean,code:string}` (no I/O or mutation).
- `code` fixed values: `invalid_input`, `identity_mismatch`, `inactive_campaign`, `approval_required`, `approval_invalid`, `approval_expired`, `recipient_blocked`, `provider_unavailable`, `duplicate_or_limit`, `allowed`.

- [ ] **Step 1: Write failing tests** exercising exact all-allowed case, missing identity, mismatched tenant/actor, inactive campaign, revoked/expired approval, changed hashes, reply/opt-out/bounce/unknown eligibility, unavailable provider, duplicate and quota.
- [ ] **Step 2: Verify RED:** `node --test scripts/ri-dispatch-policy.test.cjs`; expected failing because `dispatch-policy.mjs` does not yet exist.
- [ ] **Step 3: Implement** `authorizeDispatch(input)` with early deny guards, strict exact comparison of immutable identifiers and hashes; valid ISO expiration with `new Date()`; no side effects; explicit `allowed` only if every condition is satisfied.
- [ ] **Step 4: Verify GREEN:** `node --test scripts/ri-dispatch-policy.test.cjs` and `node --check nuvem/revenue-intelligence/dispatch-policy.mjs`; expected zero failures.
- [ ] **Step 5: Commit** `feat(ri): add fail-closed campaign dispatch policy`.

### Task 2: Deterministic campaign intent fingerprint

**Files:**
- Create: `nuvem/revenue-intelligence/intent.mjs`
- Test: `scripts/ri-intent.test.cjs`

**Interfaces:**
- Consumes: `{tenantId,campaignId,recipientId,channel,content,contactAddress,stepId}` plus explicit client idempotency key for stable retry.
- Produces: `buildIntent(input): Promise<{tenantId,campaignId,recipientId,channel,contentHash,audienceHash,idempotencyKey}>`.
- Use `crypto.subtle.digest('SHA-256', TextEncoder...)` for deterministic SHA-256; canonical serialization with known fixed field ordering; trim + reject blank mandatory inputs; never log PII.
- The idempotency key is bound to campaign/recipient/channel/step, **not** random per retry. Concurrent send/retry provider reconciliation remains gateway responsibility.

- [ ] **Step 1: Write failing tests** for same input produces same digest, different message/recipient/tenant changes digest, missing recipient rejected, stable retry key, Unicode content supported.
- [ ] **Step 2: Verify RED:** `node --test scripts/ri-intent.test.cjs` expected missing import.
- [ ] **Step 3: Implement** module without dependencies or persistent state.
- [ ] **Step 4: Verify GREEN:** `node --test scripts/ri-intent.test.cjs` with zero failures.
- [ ] **Step 5: Commit** `feat(ri): fingerprint approved outreach intents`.

### Task 3: Zero-side-effect dry-run gateway

**Files:**
- Create: `nuvem/revenue-intelligence/dry-run.mjs`
- Test: `scripts/ri-dry-run.test.cjs`

**Interfaces:**
- Consumes: Task 1 `authorizeDispatch(input)`, Task 2 `buildIntent(input)`.
- Produces: `previewDispatch({context,campaign,approval,recipient,provider,proposal}): Promise<{status:'eligible'|'blocked',reason:string,intent?:object}>`.
- Must never call a provider, modify the CRM, or write anything to the DB. Policy checks must use server-computed hashes and a separate supplied approval; empty/unapproved input is always blocked.

- [ ] **Step 1: Write failing tests** for approved eligible candidate, declined candidate, no I/O mocks invoked and idempotent preview.
- [ ] **Step 2: Verify RED:** `node --test scripts/ri-dry-run.test.cjs` expected missing import.
- [ ] **Step 3: Implement** side-effect-free composition and minimal output.
- [ ] **Step 4: Verify GREEN:** `node --test scripts/ri-dry-run.test.cjs` and replay tests for Tasks 1–2.
- [ ] **Step 5: Commit** `feat(ri): preview supervised campaigns without sending`.

### Task 4: CI guard and integration safety

**Files:**
- Create: `.github/workflows/ri-p0-policy.yml`
- Modify: none of PWA, CAS, auth or business engine

**Interfaces:**
- Consumes: Tasks 1–3 test contracts and existing regression scripts.
- Produces: independent PR CI for new pure modules, with no production secrets or external API invocation.

- [ ] **Step 1: CI workflow** triggers on PR to `claude/decisoes-estagios-vendas-eckjo0`, checkout + Node22 setup; `node --test scripts/ri-*.test.cjs`, syntax checks, `node scripts/verificar-versao-shell.cjs`, existing P0 CAS tests and optional standard regression list.
- [ ] **Step 2: Open draft PR** against active application branch; DO NOT merge or deploy.
- [ ] **Step 3: Verify new tests and existing release gates** by reading actual GitHub Actions run jobs for the final head SHA; any failing check leaves PR blocked.
- [ ] **Step 4: Record the status, limitations and next gates** in this plan and the PR. Remote CI does not prove user-device CAS recovery or authenticated-browser performance.

### Task 5: RI-01 handoff and acceptance criteria

**Files:**
- Create: `docs/superpowers/plans/2026-11-04-iad-ri-phase01-readonly.md`

**Interfaces:**
- Consumes: approved plan RI-00 interfaces and existing PWA route definitions.
- Produces: detailed plan for **read-only** Intelligence Comercial route + account briefing service; this is not an authorization to deploy or to send.

- [ ] **Step 1: Discover current route/view/Edge Function interfaces** and data sources (not just PR descriptions).
- [ ] **Step 2: Plan UI progressive rendering and server-side cached evidence retrieval with tenant safety and time budgets.**
- [ ] **Step 3: Define browser E2E and performance acceptance, no PWA regressions.**
- [ ] **Step 4: Mark pending any interfaces that require additional provider configuration or approval; commit plan only.**

## Rollback and stop criteria
- RI-00 branch is isolated. Rollback means closing/reverting its draft PR; no DB data is changed.
- No production deploy, service worker bump, SQL, sends or external account updates in RI-00.
- Stop rollout if any tenant leakage, CAS regression, unauthorized send, lost ACK, stale approval, duplicate dispatch, external provider timeout freezing navigation or unexplained performance regression is detected.
- For later phases, approved action and authoritative CRM write require separate checks at execution time even if the model earlier selected that action.

## Self-review / specification coverage
- All ten spec capabilities map to RI-01..RI-07; RI-00 implements only no-I/O policy foundation.
- Compatibility: Edge runtime supports ESM `.mjs`; Node 22 built-ins allow local tests. No `npm install`.
- No promise of exactly-once external delivery: future workers must reconcile provider delivery receipts and can retry at least once.
- No advertised P95 savings until authenticated baseline and post-change measurement.
- Full autonomous pipeline is not claimed after RI-00; the phased gates remain mandatory.
