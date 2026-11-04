# IaD RI-01 — Account Intelligence Read-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fast, permission-safe, read-only account intelligence and meeting-briefing view to IaD CRM without slowing or changing the existing pipeline, CAS, business engine or sales actions.

**Architecture:** A lazy-loaded UI route consumes an already-authorized snapshot and a pure deterministic briefing builder. Initial output is local and synchronous for visible fields, while optional server-based enrichment/evidence is fetched asynchronously and independently through a strict tenant-scoped read-only interface. No scoring, stage, CAS, outbound or contact mutations in this phase.

**Tech Stack:** Vanilla JavaScript PWA, ES modules, Node 22 node:test, existing Store/Auth/Nuvem/UI and Supabase, existing GitHub Actions. No npm dependencies by default.

**Spec:** `docs/superpowers/specs/2026-11-04-iad-revenue-intelligence-design.md`

## Global Constraints
- Reference active IaD branch `claude/decisoes-estagios-vendas-eckjo0` (v286.45 at audit). Recheck head before coding.
- Finish RI-00 CI before integrating RI-01 to a shared branch. Use a new isolated feature branch for this subproject.
- Do not publish or deploy until CI, CAS, RLS, browser performance and feature-flag gates pass.
- No SQL production, external outbound, new CRM authoritative data, service-role in browser, raw customer data in logs or LLM input without explicit request.
- Existing commercial decisions and `IADStore` remain authoritative. Display facts with sources, hypotheses as hypotheses, gaps as gaps.
- The account view should be usable before any AI or network enrichment completes, including when the AI provider is unavailable.
- No additional synchronous computation in `#/hoje`, `#/painel`, `#/pipeline` or the cockpit.
- Avoid full-document render on async completion; update only RI-01 owned DOM.
- Enforce tenant/session/access again after each awaited operation. Do not reuse stale responses after logout or tenant switch.
- The feature flag is disabled by default until release gates and switch-on approval.

## Review Focus
- Session switch during in-flight briefing → stale result discarded; Task 3.
- CAS pending or account hidden by RLS/Store policy → no shortcut to reveal account; Task 3.
- HTML tags or malicious directives in company name/source → rendered as text only; Task 2.
- Absent or unverifiable evidence → never upgraded to verified fact; Task 1.
- Very large opportunity/contact lists → no full-scan on initial CRM boot; Task 2.

---

### Task 1: Pure evidence and briefing assembler

**Files**
- Create: `src/ri/account-briefing.mjs`
- Test: `scripts/ri-account-briefing.test.cjs`

**Interfaces**
- Input `buildAccountBriefing({account,opportunities,contacts,evidence,asOf})` with preauthorized arrays; no Store or cloud dependency.
- Output `{accountId,title,summary,facts,hypotheses,gaps,decisionMap,questions,stats}` with explicit evidence `status: confirmed|hypothesis|unknown`, `source`, `capturedAt`, `expiresAt`; conservative expiration policy.
- Must filter `opportunity.contaId===account.id` and `contact.contaId===account.id`; do not include contact personal fields in logs.
- No LLM, I/O, commercial updates or registration of evidence of decision.

- [ ] **Step 1:** Write tests for verified source, stale source → unverified, missing data → unknown, unrelated accounts omitted, deterministic output, HTML payload treated as inert content.
- [ ] **Step 2:** `node --test scripts/ri-account-briefing.test.cjs` expected RED (module absent).
- [ ] **Step 3:** Implement pure builder with bounded visible output and conservative source statuses.
- [ ] **Step 4:** Same test expected PASS; benchmark 100, 1,000 and 10,000 preauthorized records, record P95 in report but no unsupported speed promise.
- [ ] **Step 5:** Commit.

### Task 2: Lazy view and output safety

**Files**
- Create: `src/ri/account-view.mjs`
- Test: `scripts/ri-account-view.test.cjs`

**Interfaces**
- `mountAccountIntelligence({root,session,loadSnapshot})` returns `{dispose,selectAccount}`; DOM updates use `textContent`, no untrusted `innerHTML`.
- Snapshot is produced by trusted PWA adapter only, using existing permitted Store context.
- Prefers select existing account over scanning all accounts; asynchronous details restricted to the chosen account.
- No change to current cockpit HTML or DOM on background result.

- [ ] **Step 1:** Tests with a minimal DOM or existing browser test harness: script payload cannot execute, no full route render, empty account, 5000 accounts lazily listed, cleanup stops stale callbacks.
- [ ] **Step 2:** RED test.
- [ ] **Step 3:** Implement progressive rendering, minimal event listeners and cleanup.
- [ ] **Step 4:** GREEN + browser smoke at 5 viewport sizes (use existing Chromium harness).
- [ ] **Step 5:** Commit.

### Task 3: Navigation + secure read-only adapter

**Files**
- Modify: `src/app.js` route definitions and lifecycle only.
- Modify: `index.html` only if necessary for lazy module loading; preserve script order.
- Modify: `src/nuvem.js` only if API retrieval necessary; initial release should prefer existing authorized snapshot.
- Create: `scripts/ri-route-cas-guard.test.cjs`

**Interfaces**
- Flag `global.IAD_RI_ENABLED === true` controls route; default false.
- Route `#/inteligencia`, label `Inteligência Comercial`.
- `App` calls the new mount API only after valid auth/context and before any remote enrichment.
- Existing CAS blocked screen remains higher priority than all app routes.
- When background request returns, compare identity, tenant, Store revision and route selection; discard stale data.

- [ ] **Step 1:** RED tests for disabled flag, logged-out session, CAS blocked, changed tenant, route navigation, authorized read-only account.
- [ ] **Step 2:** Implement narrow integration without changing existing navigation behavior under disabled flag.
- [ ] **Step 3:** GREEN plus existing login, PWA, CAS and multi-tenant suites.
- [ ] **Step 4:** Commit.

### Task 4: Optional server-side evidence with time limits

**Files**
- Create: `nuvem/revenue-intelligence/account-evidence.mjs`
- Create: `scripts/ri-account-evidence.test.cjs`
- Optional additive DDL migration in source only, NOT production, subject to RLS review.

**Interfaces**
- `loadEvidence({tenantId,actorId,accountId,signal,fetchAuthorized})` gets permission-scoped facts; never accepts a broad cross-tenant wildcard.
- Hard cap pagination, strict timeout and abort signal.
- Failure returns reason and preserved local briefing. No hidden extra broad web searches on every card opening.
- Field-level source+timestamp, TTL, conflicts and evidence provenance explicitly visible.

- [ ] **Step 1:** RED tests 401, 403, empty, delayed, aborted, stale response, tenant mismatch.
- [ ] **Step 2:** Implement safe read-only adapter, no service token in client.
- [ ] **Step 3:** GREEN local/unit and authenticated RLS testing in isolated environment.
- [ ] **Step 4:** Commit and document provider costs.

### Task 5: Performance, security and rollout gate

**Files**
- Create: `.github/workflows/ri-01-account-intelligence.yml`
- Modify: `src/config.js` and `sw.js` only when preparing a versioned release candidate with mutually consistent cache; keep disabled until approval.
- Test: existing PERF-17, PERF-24, PERF-31, PERF-33, PERF-34 and CAS suites.

- [ ] **Step 1:** Check if load and re-render of Hoje, Painel, Pipeline and existing cockpit are unchanged with flag off.
- [ ] **Step 2:** Measure real browser P50/P95 route opening with 400, 2500 and 10000 synthetic opportunities, warm/cold cache, 1/5 simultaneous authorized users.
- [ ] **Step 3:** Exercise malicious evidence text, RLS cross-tenant and CAS conflict states.
- [ ] **Step 4:** Produce draft PR against active application branch and document all workflows, fail or pass.
- [ ] **Step 5:** Rollout only after human acceptance: canary flags, measured non-regression and rollback. Never claim user-device CAS recovery without actual proof.

## Handoff
RI-01 does not send outreach, create tasks or change opportunity decisions. RI-02 discovery and RI-03 server-side campaign approval/queue each need dedicated specs and review gates. An external account source is not permitted to issue action instructions to the assistant or to tools. Buyer/contact enrichment is subject to applicable privacy law, public terms and source quality.
