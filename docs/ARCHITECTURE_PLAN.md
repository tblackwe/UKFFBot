# UKFFBot — Architecture Hardening Plan

> Plan to get the project caught up and fix fragility. Organized into four phases by
> risk and dependency, sequenced so cheap high-confidence wins land first and riskier
> behavioral changes come after there is test coverage to catch regressions.

**Guiding principle:** invert the data model (APIs become source of truth, hardcoded
data becomes fallback), align the deployed infra with the code, and make the bot
survive its upstream dependency hiccupping. Each phase is an independent, shippable PR.

---

## Phase 1 — Infra/code alignment (low risk, high ROI)
*One template + config PR. No behavior change in the app code.*

1. **Enable DynamoDB TTL** — add `TimeToLiveSpecification` (`AttributeName: ttl`,
   enabled) to the table in `template.yaml`. Stops event-dedup records accumulating
   forever (currently only `lambda-handler.js:269` writes `ttl`, and nothing expires).
2. **Add the `SlackChannelIndex` GSI** — partition key `slackChannelId`, projection
   `ALL`, so `datastore.js:222` stops falling back to a full-table `Scan` on every
   channel lookup. (Alternative: delete the dead GSI query path and keep the scan —
   but a real index is the right call.)
3. **Bump runtime to `nodejs22.x`** in `template.yaml:24` to match `package.json`
   engines (`>=22.0.0`) and what we test on. Currently deploys on `nodejs20.x`.
4. **Bump Lambda memory** for the Slack handler 256MB → 512MB (memory scales CPU;
   helps cold-start JSON/SDK init within the 30s budget).

**Verify:** `sam validate && sam build`; confirm GSI/TTL in the deployed stack;
smoke-test a channel command.
**Risk:** Low. GSI creation is online/backfilled; TTL is additive.

---

## Phase 2 — Sleeper/ESPN resilience (the core fragility fix)
*One PR in the service layer.*

1. **Add a fetch wrapper** in `sleeper.js:15`: per-request timeout (`AbortController`,
   ~5s), 2–3 retries with exponential backoff + jitter, retry only on 5xx/429/network
   errors (not 4xx). Same treatment for the ESPN schedule fallback.
2. **Stop cascading failures** in `rosterAnalyzer.js:42`: where partial results are
   useful, switch `Promise.all` → `Promise.allSettled` and degrade gracefully instead
   of failing the whole check.
3. **Serve-stale-on-error for caches:** when an upstream refresh fails, fall back to
   the last cached value (even if past its app-level expiry) rather than erroring.

**Verify:** unit tests with mocked `fetch` for timeout/retry/giveup; a test proving one
failed call in the roster fan-out yields partial results, not total failure.
**Risk:** Medium — touches the hot path. Mitigated by tests written alongside.

---

## Phase 3 — Kill the manual annual data tax
*One PR. Makes future seasons zero-code.*

1. **Invert bye-weeks sourcing:** move the ESPN-fetch logic from `update-bye-weeks.js`
   into the service so `getNflByeWeeksWithCache` does **API → DynamoDB cache →
   hardcoded fallback**. Hardcoded `NFL_BYE_WEEKS_20xx` tables stay only as backstop.
   A new season then needs no code change.
2. **De-dup the team-abbreviation map** (`WAS↔WSH`) currently copy-pasted in
   `sleeper.js` and `nflDataCache.js`. Extract to one shared module.
3. **Auto-refresh:** point the existing EventBridge cadence (or a small weekly rule) at
   a refresh so the cache self-heals if ESPN corrects data mid-season (cf. the
   2025-10-03 correction).
4. Keep `update-bye-weeks.js` as a manual override/debug tool.

**Verify:** test that a cache miss triggers an ESPN fetch and populates DynamoDB; that
ESPN failure falls back to hardcoded; run for 2026 end-to-end.
**Risk:** Medium — changes how canonical data is resolved. Phase 2's serve-stale net
backs this up.

---

## Phase 4 — Observability & test coverage (hardening)
*Can split into two smaller PRs.*

1. **Surface silent failures:** the draft monitor fails to `console.error` only
   (`draftMonitor.js`) — add a CloudWatch alarm on Lambda `Errors`/throttles for all
   three functions, and a lightweight structured-log helper (level + correlation id
   per invocation) to replace bare `console.log`.
2. **Backfill tests where it hurts:** `datastore.js` (~31%) and `checkRosters.js`
   (~42%). Target league CRUD, the GSI/scan path, and error branches.
3. **Enforce in CI:** add a Jest coverage threshold (start at current ~55% as a
   ratchet) and make `npm audit --audit-level high` fail the build instead of
   `continue-on-error`.

**Verify:** `npx jest --coverage` meets threshold; trip an alarm in staging.
**Risk:** Low.

---

## Deferred (track, don't do now)
- `@slack/bolt` v3 → v4 migration (breaking; schedule deliberately).
- AWS SDK version bump (~40 minors behind) — fold into a routine dependency PR.
- Template the prod API Gateway URL out of `manifest.json:33`.

---

## Suggested sequencing
**Phase 1 → 2 → 3 → 4**, as four PRs. Phase 1 is a safe quick win. Phase 2 lands before
Phase 3 because serve-stale is the safety net that makes the data-sourcing inversion
low-risk. Phase 4 can run in parallel once 2 is in.

Phases 1–2 are the genuine "fragility" fixes. Phase 3 is the bigger architectural change
— worth doing, but get sign-off on the approach (auto-refresh cadence, how aggressively
to trust the API over hardcoded data) before building.
