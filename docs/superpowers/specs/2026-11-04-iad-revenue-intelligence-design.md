# IaD CRM — Revenue Intelligence & Autonomous Sales Operations
**Design proposal — 2026-11-04 — DRAFT / NOT APPROVED FOR IMPLEMENTATION**

## 1. Objective
Make the existing IaD CRM execute B2B discovery, account enrichment, qualification, meeting preparation, approved multichannel sequences, response classification, follow-ups and CRM updates, with human supervision, auditable evidence, tenant isolation and minimal impact on interactive performance. This is an extension of the existing product, **not a separate CRM**.

## 2. Reality verified (2026-11-04)
- GitHub `maiaalex2306/iad`; reference code inspected in branch `hotfix/p0-cas-readonly-portfolio-v286-45` (not asserted to be live in production).
- Existing PWA is local-first. `src/nuvem.js` synchronizes browser store with Supabase; `src/cas-queue.js` manages per-user/per-tenant pending operations with CAS, ACK and recovery.
- Existing routes in `src/app.js`: Hoje, Painel, Pipeline, Tarefas, Conversas, Revisão, Cadastros, Nutrição, Configuração, Contas, Método and Notas.
- Current DB project `IDA` in `sa-east-1`; public tables include contas, contatos, oportunidades, tarefas, emails, mensagens_whatsapp, sinais, perfis, iad_sync_eventos and iad_cas_receipts. RLS is enabled on those tables. No `pgmq`, `pg_cron`, `pg_net` extension is installed according to inspected pg_extension.
- Existing Edge Functions: email, whatsapp, assistente, rapid-api, quick-action, hyper-action, hyper-task, rapid-service and convite.
- Existing email Edge Function is capable of queued SMTP sending and IMAP ingestion. Existing WhatsApp Edge Function implements inbound Meta webhook ingestion; outbound capability was not verified. Existing assistente supports multiple LLM providers.
- There is a recent P0 CAS incident associated with three pending local operations and browser access restrictions; releases up through PR #106 propose recovery, not proof that user's device has been recovered.
- The repository default main branch is not the reference for the active CRM source; the implementation baseline and live publication must be verified before writing product code.

## 3. User-selected product behavior
The user wants **automatic execution**, not just research and draft generation. Must include: research, discover/enrich, qualify, propose cadences, execute approved communications, process replies, create follow-ups, update appropriate CRM fields, and provide full human oversight. Prefer existing production data and IaD navigation. No new standalone CRM or replacement of commercial decision rules.

## 4. Architectural alternatives considered
A. Embed all agent logic in current browser modules. Cheapest initial UI work, but fails browser-closed execution and risks main-thread slowness and CAS conflicts. Rejected.
B. Create a separate SaaS sales product and duplicate CRM data. Increases integration, synchronization and authorization complexity. Rejected.
C. **Recommended:** modular server-side workflow engine integrated with the current PWA and Supabase database; UI remains thin, queues perform durable work, integration adapters reuse existing providers. The live data remains in the established project, with gated additive migrations, feature flags and isolated automated/local tests.

## 5. Functional capabilities
1. Market Discovery: region + sector + ICP parameters + source provenance, coverage estimates, dedupe candidates, quality checks.
2. Account Intelligence: verified facts, relevant signals, hypotheses, pain/benefit map, evidence timestamps, confidence.
3. Decision Mapping: named contacts only from permitted sources, role taxonomy, unknowns, manual confirmation, multi-person buying committee coverage.
4. Meeting Prep: deterministic assembly of CRM evidence, optional retrieval, questions, expected objections, proposed next commitment.
5. Outreach Studio: personalized content, channel policy, cadence templates, working hours and approvals; never send based solely on raw model output.
6. Sequence Engine: create timed steps, track state, pause/stop on reply, opt-out, invalid consent, new opportunity stage or stale approval.
7. Inbox Intelligence: ingest emails/WhatsApp replies, classify with confidence and explicit source, suggest follow-up; do not equate message with commercial decision evidence.
8. CRM Action Engine: creates tasks, notes and supplementary data with traceability; changes to opportunity's decision stage/score/financial commitments require existing engine rules and, where applicable, human approval.
9. Learning: calibrated conversion analysis by ICP, source, persona, offer and channel; avoid leakage across tenants and spurious claims of causality.
10. Governance: review queues, permission matrix, consent/opt-out, audit, policy version, quotas, kill switch, metrics and safe rollback.

## 6. Minimal technical architecture
- `IaDOrchestrator`: server-side state transitions; reads tenant/user campaign policies, approval tokens and data versions.
- `WorkQueue`: durable queue with visibility timeout, retry schedule, dead-letter handling, concurrency limits and backpressure. Preferred candidate: Supabase Queues (`pgmq`) + Cron/worker; confirm availability and costs before enabling.
- `AgentAdapters`: market, accounts, contacts, messaging and LLM. Use one shared orchestration framework, not 100 independent chat agents.
- `ActionGateway`: sole service allowed to make side effects. Each action must prove tenant, actor, approval, audience, content hash, current consent, current CRM revision, campaign state and idempotency key at execution time.
- `ProviderAdapters`: current IMAP/SMTP workflow, official outbound Meta channel if configured and authorized, compliant enrichment sources; LinkedIn automations limited to approved official API permissions and user-guided tasks, not unauthorized scraping or automated messaging.
- `EvidenceStore`: source URL/provider, captured_at, asserted fact, confidence, TTL, policy; differentiate facts, hypotheses and unknowns.
- `ReadModel`: precomputed account briefing and campaigns, incremental updates; does not block initial PWA navigation.
- `AuditLedger`: append-only history of proposal, approval, execution attempts, provider receipt, delivery, reply, CRM mutation and rollback.

The worker must not depend on a user keeping the browser open. The PWA fetches lightweight job summaries and uses selective, tenant-safe invalidation.

## 7. Conceptual additive data model
Possible tables in `public` (names subject to review):
- `iad_ri_campaigns` (tenant, owner, ICP, audience filters, channel, schedule, policy version, enabled, approval state).
- `iad_ri_candidates` (tenant, company identity, source, dedupe key, facts, status, score version).
- `iad_ri_evidence` (tenant, entity, claim, source, captured_at, TTL, verification status).
- `iad_ri_sequences` / `iad_ri_steps` (tenant, contact, campaign, approved template, state, next_run).
- `iad_ri_approvals` (tenant, actor, permission scope, audience hash, template hash, expiration, revocation).
- `iad_ri_actions` (tenant, idempotency key, actor, target, preview, state, attempt count, provider receipt).
- `iad_ri_suppressions` (tenant, channel, normalized endpoint, reason, timestamp, expiry if applicable).
- `iad_ri_runs` / `iad_ri_audit` (trace, latency, execution outcome, immutable actor information).
- `iad_ri_usage` (tenant budgets, provider quotas and actual expenditure).

Create no production tables or extensions before migration review and authorization. Every exposed table has restrictive RLS; worker secrets are backend-only; functions with privileged execution validate tenant ownership explicitly and enforce least privilege. Do not use public `SECURITY DEFINER` functions without careful audit.

## 8. Human-in-the-loop policy
- Level 0 (automatic): public market research, data normalization, scoring, evidence collection, non-mutating previews.
- Level 1 (operator approval per campaign): outreach copy, recipients, channels, times, message budget and stop conditions. Approval is immutable, hash-bound and expires.
- Level 2 (automatic only within the approved policy): scheduled messages using approved channels, known recipient conditions, deliverability and suppression checks; safe tasks and routine status updates.
- Level 3 (explicit individual approval): prospect-specific exceptions, materially revised messaging, high-impact account changes, financial figures, opportunity stage/eight-decision evidence and any potentially irreversible commercial action.
- Emergency STOP: disables future dispatch but does not delete queued action history; no retry after a new opt-out or campaign pause.
- After any incoming reply, pause pending outbound steps for the contact until classification and appropriate disposition.
- Changes by a human invalidate conflicting stale agent proposals.

Defaults: dry-run and approval required for outbound messages; first launch behind feature flag; no mass send until measured canary is approved.

## 9. Security / compliance
- Multi-tenant isolation in Postgres via RLS and worker-side tenant validation. Prove admin/manager/salesperson matrices by test.
- Keep secrets out of browser, Git, logs and LLM prompts; least privilege for providers.
- LGPD: source provenance, lawful purpose/basis verification, minimization, contact objections, retention, deletion workflow, access audit, suppression.
- Respect channels' policies: unauthorized LinkedIn scraping, browser bots and mass messaging are out of scope; WhatsApp sends require official API capabilities, permitted templates/window and documented recipient eligibility. No forced workaround.
- Treat all scraped/received content as untrusted input; prompt injection resistance: text from a site or inbound message cannot grant approval, invoke tools or change system policy.
- Apply global + tenant + campaign rate limits, complaint monitoring, bounce handling and suppression.
- No claim of exactly-once external delivery solely because a queue offers a visibility timeout. Use idempotency keys, provider receipt lookup and reconciliation; safe at-least-once job semantics.

## 10. CAS / source-of-truth boundaries
Existing local-first CRM is not superseded by autonomous writers:
- Agent writes use an authorized server-side command gateway and version checks, not raw table upserts or client CAS journal manipulation.
- Agent-generated recommendations/evidence should first land in separate tables. Only human-validated decisions flow into authoritative CRM fields through existing logic.
- On conflicting revisions, pause and enqueue review. Do not discard local work, overwrite remote changes or auto-rebase unexamined payloads.
- When a browser is offline, only the server-side durable workflow continues; customer-facing UI displays sync and approval status on reconnect.

## 11. Performance and cost SLOs (targets, not observations)
- No additional blocking calls during initial PWA load; no autonomous work on browser main thread.
- Interactive INP: target <= 200ms at p75; common UI response p95 < 300ms where data is already local.
- Enqueue/approve UI feedback target < 300ms local; durable ACK reported separately.
- Incremental display of candidate results and account briefing; batched background enrichment; query projections; cursor pagination; per-tenant cache keys.
- Bound concurrency per provider and tenant; exponential retry with jitter; bulkheads, circuit breakers and quotas.
- Deterministic qualification before LLM; consolidate LLM calls across multiple leads where quality allows; cache with freshness and privacy boundary.
- Track p50/p95/p99 per route, SQL, worker, external API, queue wait, LLM calls, dispatch, reply processing; cost per qualified lead, meeting and opportunity.
- Prove no regression to existing CAS, cards, pipeline, auth, PWA and multitenant navigation.

## 12. Delivery phases and release gates
P0. Verify live production SHA, Pages/service-worker consistency, and resolve or safely isolate current CAS conflict. Establish baseline authenticated browser timings and no-loss tests.
P1. Add feature-flagged read-only Account Intelligence + meeting briefing. No external sends or authoritative CRM edits.
P2. Candidate discovery/enrichment + dedupe + source provenance and review UI.
P3. Approval workflow, safe action gateway, queue and dry-run cadence executor. Prove idempotency, dead letter, stop conditions and permissions.
P4. E-mail dispatch integration and inbound reply pause; canary with tightly limited approved recipients, verified provider receipts, bounce/opt-out monitoring.
P5. WhatsApp outbound only if official API and recipient eligibility are verified; LinkedIn integration only within provider terms.
P6. Suggested CRM changes and reversible safe automation. Financial/stage/decision advances remain separately approved.
P7. Measurement/learning, experiments, global rollout and documented rollback.

Each gate: reproducible tests, contract tests against provider adapters, browser E2E, auth/RLS matrix, CAS conflict/duplicate injection, load test, no data loss, CI green, version/CSP/security review and independently confirmed public deployment. No synthetic outreach to real contacts.

## 13. Core tests / invariants
- An action for tenant A must never use contact, credential, template or data from tenant B.
- A revoked, expired or changed approval never dispatches.
- Opt-out, bounce, reply, STOP or changed identity prevents future dispatch.
- Retrying a timed-out message cannot create an unreviewed duplicate; uncertain provider outcome enters reconciliation instead of blind retry.
- Existing CAS pending edits remain intact across agent activity, reload and offline recovery.
- Agent output never changes score, commercial evidence or deal stage without applicable existing business rules and explicit sign-off.
- Failed external services cannot freeze the PWA or prevent seller access to existing account records.
- All actions have transparent actor, source, reason, approval and timestamp.

## 14. Tradeoffs and open approval
- Preferred design is modular IaD, not a rebuild, using the existing production business database with additive, gated changes and feature flags.
- Automated outbound is permitted **only within a human-approved scope**; high-impact actions require individual sign-off.
- Background work needs a durable queue/worker, not browser timers.
- Verify current production baseline and reconcile current CAS before writing authoritative records.
- This is a **design proposal**; implementation, SQL migrations, outbound deliveries and production publication are **not authorized by creation of this document**.
