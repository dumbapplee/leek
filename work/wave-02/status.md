# Status: Wave 02 (Max)

## input-validation task end

**Date:** 2026-11-06. **Check by:** Max (read-only on code).

**Progress.** input-validation is done (Tom PASS at step 5, re-review). Next task: retry-policy (step 1). Sample checked: `src/domain/validation.ts`, `src/domain/countryCodes.ts`, `test/validation.test.ts`.

**1. Task cycle steps 1 to 5: recorded.**
- Step 1 requirements: `work/wave-02/requirements.md`, sources cited per rule.
- Step 2 tests and red run: `work/wave-02/qa.md`. Red run is an import failure (module missing), not a behaviour failure. No assertion-level red is recorded.
- Step 3 implementation log: `work/wave-02/reasoning.md`.
- Step 4 verify: `reasoning.md` (typecheck exit 0, validation tests and full suite green).
- Step 5 review: `qa.md`, verdict PASS after one FAIL (F1). Sam approved the F1 fix.

**2. Scope: not verified.** This session has no shell, so `git status` could not run. The file tree shows the expected task files and the protected paths present (`wiremock/`, `compose.yaml`, `MOCK-ENVIRONMENT.md`). No content change could be checked. Max also created an unwanted file (see concern C4).

**3. Acceptance (AGENT input-validation).**
- Field errors carry field and reason: covered (AC1, AC4, AC6, AC7).
- eventType and schemaVersion match the sample: covered (AC2, AC3).
- Header mismatch rejected before rows: the failure result is covered (AC8). "Before any row" is a Wave 3 caller rule (requirements section 2). Hand-off, not a gap in this task.

**4. Source conflicts.**
- countryCode: assignment wins (TH section 3, line 86), decided by the user. Recorded in `qa.md` (Q1) and `requirements.md` (Q1, R18, R29, AC5, E06, R-07). Copilot rules rank the assignment above AGENT.md, so no guess was made.
- `plan/wave-02-building-blocks/AGENT.md` still says "two uppercase letters" in the input-validation "What to do". Open. Sam raises it with the user.

**5. Open items.**
- ISO list source is the GitHub dataset `datasets/country-codes` (`data/country-codes.csv`, fetched 2026-11-06). It is not pinned to a version and was not checked against the official ISO 3166-1 publication (`qa.md`, step 5). Provenance is in `reasoning.md` only, by Sam's decision (F2).
- Q14 (UK and EU rejected, XX and ZZ rejected): decided by Sam (`qa.md` F4 and "Confirmed by Sam"). `requirements.md` still says "Q14 open" (line 3) and "OPEN" (section 10). Not updated.

**Concerns**

- **C1. Source conflict still open.** `plan/wave-02-building-blocks/AGENT.md`, input-validation "What to do" says "countryCode as two uppercase letters". The assignment (ISO 3166-1 alpha-2) wins. Suggested action: Sam raises it with the user and the plan is corrected by its owner.
- **C2. Stale requirements.** `work/wave-02/requirements.md` line 3 and section 10 (Q14) say OPEN, though Sam decided it in `qa.md`. R18 still says "Which ISO list applies is open (Q14)". Suggested action: Poppy updates Q14 to decided (UK and EU rejected, XX and ZZ rejected).
- **C3. Tests after code, and stale reasoning.** The F1 test (AC10, header non-array) was added at step 5, after the code passed. It was never seen red (`qa.md` F1). `reasoning.md` still reports 146 tests and "Tests in test/ not modified", but the final count is 149 (`qa.md`). Suggested action: Sam notes the deviation from tests-first for this task. Dan updates the reasoning results before the wave-end hand-off.
- **C4. Stray file created by Max.** `work/wave-02/status.md.tmp-probe` (one line, text "probe") was created by mistake during this check. It is outside the rule that Max edits only `status.md`. Max has no delete tool, so it could not be removed. Suggested action: Sam deletes it before wave close.
- **C5. Scope not verified by git.** Max could not run `git status` in this session. Suggested action: Tom or Sam confirms `git status` shows only `src/domain/`, `test/validation.test.ts` and `work/wave-02/` changes for this task.

Concerns: C1 to C5 above. Sam acts on C1, C2, C4 and C5 before the wave closes. C3 is a process note for Sam and Dan. None blocks retry-policy.

## retry-policy task end

**Date:** 2026-11-06. **Check by:** Max (read-only on code).

**Verdict used:** Tom PASS (`qa.md`, "Step 5 re-run after F5 fix"). 63 retry tests and 256 full-suite tests green per qa.md. Not re-run by Max.

**1. Cycle steps 1 to 5: recorded.** Requirements (`requirements.md`, "## retry-policy", Sam decisions 1-11 and OQ-1 to OQ-12). Tests and red run (`qa.md`: first red is module missing, 0 of 60 tests ran). Implementation (`reasoning.md`). Verify (typecheck and tests, per `reasoning.md`). Review (`qa.md`: FAIL, then FAIL on F5, then PASS). The F1, F2 and F5 tests were added after `src/` existed (see concern R3).

**2. Scope.** Expected files present. `src/infra/` holds only `retry.ts`. `docs/` holds only `decisions.md`. `test/` holds `retry.test.ts` plus validation, health and config. No new files under `wiremock/`, `compose.yaml` or `MOCK-ENVIRONMENT.md`. Content is not verified: no shell here, so `git status` did not run (C5 still open).

**3. Acceptance (AGENT retry-policy).** Covered by `test/retry.test.ts` per the mapping in `qa.md`. Retry-After 5 with injected clock: AC-retry-01. Terminal never retried: AC-retry-02, AC-retry-16. Last error returned, not thrown: AC-retry-04. Defaults justified in `docs/decisions.md`: yes. The AGENT.md boxes are still unticked; Sam decides whether ticking belongs to close.

**4. Sam decisions.**
- OQ-1 to OQ-12: recorded in `requirements.md`, "Open questions for Sam" (all CLOSED).
- OQ-10 (trim): recorded in `requirements.md` (OQ-10, R-retry-14, Contract). Yes.
- 500, 502, 504 terminal, flagged for user review: recorded in `requirements.md` (R-retry-09, N-2) and `docs/decisions.md`. Yes.
- F3 timer clamp: **not in `requirements.md`**. Found only in `qa.md` (test row, line 154) and `reasoning.md` (line 39). Open item.

**5. Carry-over.**
- C1 (AGENT.md "two uppercase letters"): still open. `plan/wave-02-building-blocks/AGENT.md` line 50 unchanged.
- C4 (`work/wave-02/status.md.tmp-probe`): still exists (viewed, text "probe").
- C5 (git scope): still unverified.

**Concerns**

- **R1. F3 clamp missing from requirements.** `work/wave-02/requirements.md` has no clamp rule. `src/infra/retry.ts` line 24 clamps to `maxTimerMs` (2147483647), and the test at `test/retry.test.ts` line 379 covers it. Suggested action: Poppy adds the clamp to R-retry-04 or R-retry-12 and sets the status line from "Step 2" to done. Sam confirms.
- **R2. 500, 502, 504 terminal, user review pending.** `docs/decisions.md` "Open for user review" and `requirements.md` R-retry-09. Suggested action: Sam raises it with the user before Wave 3 relies on the classification. Not a close blocker, but it must be answered before wave close.
- **R3. Tests written after code (F1, F2, F5).** `qa.md` fifth round: F1 and F2 "pass on the current code", and no red was recorded for them. F5 was checked by reasoning only (`qa.md`, "Mutation check (reasoned from the code, `src/` not edited)"). The first red was module-missing, so no assertion-level red exists for the original 60 behaviour tests. Suggested action: Sam notes the deviation from tests-first, as for input-validation C3.
- **R4. Stale reasoning counts.** `reasoning.md` results say 60 retry tests and 253 full-suite tests. Final is 63 and 256 (`qa.md`). Suggested action: Dan updates the results before the wave hand-off.
- **C1, C4, C5** as above. Sam acts on them before wave close.

Concerns: R1 to R4, and C1, C4, C5 as above. R1 and R2 need Sam's action before wave close. Retry-policy is otherwise ready.
