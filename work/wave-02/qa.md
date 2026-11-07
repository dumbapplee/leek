# QA: Wave 02

## input-validation

**Status:** Step 5 re-review done. **Verdict: PASS** (F1 closed, see "Verdict" below). Step 2 tests, change request and red runs kept for history.

**Change request (Sam, step 2).** The assignment (`Take-Home Exercise_ Size-Level Availability Processor.md`, section 3) says `countryCode` is an ISO 3166-1 alpha-2 code. The assignment is the source of truth and overrides the wave brief rule "two uppercase letters". Tests now accept `PT`, reject unassigned pairs (`XX`, `ZZ`), and keep rejecting lowercase, three-letter, malformed, empty and non-string values. `work/wave-02/requirements.md` now states ISO 3166-1 alpha-2 in R18, R29, AC5, E06 and R-07 (checked at step 5). Only `AGENT.md` still says "two uppercase letters" (F3).

**Test file:** `test/validation.test.ts`. Unit tests only. 48 `it` blocks, 146 cases after `it.each` expansion (counted from the source; the runner has not executed them yet). Event rules, CSV header and CSV row. Sample event read from `wiremock/__files/sample-event.json`.

**Test list by acceptance criterion** (AC from `work/wave-02/requirements.md` section 9)

| AC | Tests |
|---|---|
| AC1 non-empty field and reason | `gives each event error a field name and a non-empty reason`; every header and row error uses a non-empty reason matcher |
| AC2 sample event passes | `accepts the sample event from sample-event.json` |
| AC3 eventType and schemaVersion | `rejects eventType %s` (2); `rejects schemaVersion %j` (4) |
| AC4 each required field | `rejects an event without %s` (10, one per field) |
| AC5 countryCode | `accepts PT as a known ISO 3166-1 alpha-2 countryCode`; `rejects countryCode %j that is not assigned in ISO 3166-1` (`XX`, `ZZ`); `rejects lowercase countryCode %j` (`pt`, `Pt`); `rejects a three-letter countryCode` (`PTT`); `rejects an empty countryCode`; `rejects malformed countryCode %j` (`P`, `P1`, `PT `); `rejects non-string countryCode %j` (`5`, `null`, `["PT"]`) |
| AC6 availableQuantity | `rejects availableQuantity %s` (`-1`, `1.5`, `'3'`, NaN, Infinity, 2^53); `accepts availableQuantity %s` (0, 2^53-1) |
| AC7 one error per bad field | `reports one error for each of three bad fields` |
| AC8 header mismatch | `rejects swapped columns...`, `rejects a header with one column missing`, `...one extra column`, `rejects the header when %s is written as %j` (3), `rejects an empty header...`. All return `field: header`, `line: 1`. The "return before rows" part is a caller rule and is not testable here. |
| AC9 CSV row line number | `rejects availableQuantity cell %j with the row line` (9); `rejects sourceVersion cell %j...` (9); `rejects countryCode cell...` (5); `rejects unassigned countryCode cell %j...` (`XX`, `ZZ`, 2); `rejects %s cell %j...` (blank strings, 6); `reports line %s on a bad row` (2, 10001); `reports the line number as given` (1, 0, 1.5) |
| AC10 never throws | `rejects a non-object input %j with one event error` (null, undefined, text, 42, true, array); `rejects cells given as %j with one row error` (null, undefined, text) |

Other rules covered: ISO check for countryCode (above); occurredAt accepted and rejected forms; non-string and blank string fields; `accepts %s cell %s` boundaries; fault inputs in events and rows; extra keys ignored; `ignores...`; leading zero `007`; two bad cells in one row; cell counts 0, 5, 7; `gives event errors no line property`; `keeps an untrimmed sellerId as given`.

Not in this wave: R-16 (CSV fixture rows, deferred to Wave 3, Q13).

**Expected red run (before Dan's implementation):** the suite cannot load because `src/domain/validation.ts` does not exist. 0 tests run. Typecheck reports only the missing module.

**Red run, recorded:**
- `npm.cmd test -- validation` (plain `npm` is blocked by PowerShell execution policy; `npm.cmd` runs the same script). Vitest v5.1.0 starts. `test/validation.test.ts` fails at import: `Cannot find module '../src/domain/validation.js'`. Tests: no tests run. Exit code 1.
- `npm.cmd run typecheck`: one error, `test/validation.test.ts(8,8): error TS2307: Cannot find module '../src/domain/validation.js'`. No other error. - `npm.cmd run typecheck`: one error, `test/validation.test.ts(8,8): error TS2307: Cannot find module '../src/domain/validation.js'`. No other error. Calls into the missing module are not type-checked until the file exists.

**Red run after the change request (countryCode ISO alpha-2), recorded:**
- `npm.cmd test -- validation`. Vitest v5.1.0 starts. `test/validation.test.ts` fails at import: `Cannot find module '../src/domain/validation.js'`. Tests: no tests run. Exit code 1. Same red result as before; the new countryCode tests cannot run until `src/domain/validation.ts` exists.
- Typecheck was not re-run in this step (only the test run was requested).

**Open questions**
- **Q1 (resolved by change request).** `countryCode` is ISO 3166-1 alpha-2 per the assignment (section 3). The earlier `/^[A-Z]{2}$/` decision is overridden. Open follow-up: `work/wave-02/requirements.md` (R18, R29, AC5 wording) and the `AGENT.md` input-validation line still say "two uppercase letters". Poppy to update; QA does not edit requirements.md. Closed at step 5: requirements.md is updated (see the Change request paragraph above).

### Step 5: review and gate (Tom, 2026-11-06)

**Commands run and results**
- `npm.cmd run typecheck` (`tsconfig.typecheck.json` includes `src` and `test`): exit 0, no errors.
- `npm.cmd test -- validation`: 1 file, 146 tests passed, exit 0.
- Manual check, script in `%TEMP%\qa-wave02\manual-check.ts`, run with `node_modules\.bin\tsx.cmd` (outside the repo, nothing added to it):
  - Sample event `wiremock/__files/sample-event.json`: `ok: true`, value equals the file.
  - CSV header in fixture order: `ok: true`, value `null`. Header with `productId` and `sellerId` swapped: `{ field: "header", reason, line: 1 }`.
  - Row `seller-001,style-1,size-34,pt,1.5,1` at line 7: two errors, `countryCode` and `availableQuantity`, both `line: 7`.
  - Row `seller-001,style-1,size-34,PT,0,1` at line 2: `ok: true`, `availableQuantity: 0`, `sourceVersion: 1`.
  - Non-array header (`null`, `undefined`, `"sellerId"`): header error on line 1, no throw. Row cells `null`: row error on line 2, no throw. Event `"x"`: `event` error, no throw.
  - Event with extra key `extra: 1`: `ok: true`, and the value keeps `extra`.
  - Edge probes: `occurredAt` `2026-10-20T24:00:00Z` accepted; `T08:60:00Z` rejected; `+99:99` rejected; `.123456Z` accepted; `2024-02-29` accepted; `2026-02-29` rejected. Quantity `007` gives `7`; `9007199254740993` and a 400-digit quantity are rejected.
- ISO list check (point 2): `curl.exe` fetched `datasets/country-codes/data/country-codes.csv` from GitHub raw (133,991 bytes). Column `ISO3166-1-Alpha-2` has 249 non-empty, distinct codes. Compared with the 249 entries in `src/domain/countryCodes.ts` (script in `%TEMP%`): 0 codes only in the constant, 0 only in the dataset. `XX`, `ZZ`, `UK` and `EU` are not in the dataset. The official ISO OBP publication was not reached from here, so the list is not checked against it.
- Cast check (point 3, scratch files in `%TEMP%`, `tsc --strict`): `Record<string, unknown> as Plain` fails with TS2352. `as Indexed`, an interface with `[key: string]: unknown`, compiles. But `keyof Indexed` accepts any string, so `Record<keyof SellerInventoryChanged, Check>` (validation.ts line 63) would stop flagging a missing event field.

**Point 2: ISO list.** Acceptable, with the source recorded. TH line 86 asks for ISO 3166-1 alpha-2 codes, so the rule is the set of assigned codes. The constant matches the dataset exactly (249 of 249). The dataset is a secondary source, not pinned to a version, and not checked against the ISO publication. Recorded in `reasoning.md` only, not in code (F2).

**Point 3: cast.** Justified and kept. The runtime checks in `eventChecks` decide the shape, and the compiler cannot see that link. The tests fix the value as the same object as given: `ignores keys outside the ten fields` and `accepts the sample event` compare with `toEqual`, and an extra key would be lost by any copy or pick. A single cast does not compile against the typed check table (see above). `as unknown as` at validation.ts line 92 is the smallest correct form here (F5).

**Code review against code style and the acceptance criteria**
- No `any` in `src/domain/validation.ts`, `countryCodes.ts` or the test file. Module boundaries are typed (`ValidationResult<T>`, `Check`, `validateCsvRow` return type).
- One comment (validation.ts line 144) and it gives a why. No commented-out code, no TODO, no dead code. All exports are used.
- Never throws: `isRecord` (not an array, not null) guards the event; `Array.isArray` guards the header (line 97) and the row (line 107). Header and row non-array inputs were run and do not throw.
- Field errors carry `field` and a non-empty `reason` (R8, AC1). CSV row errors carry `line` (R31, AC9). Event errors have no `line` key (R11).
- Header mismatch returns one `header` error on line 1 (R25, AC8). The return-before-rows part is a caller rule (requirements section 2, AC8) and is not testable here.
- Requirements R5, R9, R13, R14, R17 to R22, R23 to R25, R27 to R31 and R33 match the code and the tests as read.

**Findings**

- **F1. High. Blocks PASS. Closed.** Test gap for AC10 and R5. Closed at re-review: `it.each([null, undefined, 'text'])` added in `describe('validateCsvHeader')` (test/validation.test.ts), expects `failureAt('header', 1)`. Original finding: `test/validation.test.ts` lines 252 to 285 (`describe('validateCsvHeader')`) have no non-array input case. AC10 and R5 require that no function throws for `null`, `undefined` and primitives. The code handles them (manual run above), but no test proves it. Fix: in that `describe`, add `it.each([null, undefined, 'text'])` that expects `failureAt('header', 1)`, the same pattern as the row case at test line 365 (`asCells` helper).
- **F2. Low.** The ISO source is not in code. `src/domain/countryCodes.ts` names no source or date. Fix option: one line above the constant naming the source and date (the why is not obvious). Sam decides; the reasoning note alone is also acceptable.
- **F3. Low. Plan document, Sam to update.** `plan/wave-02-building-blocks/AGENT.md`, task `input-validation`, "What to do", still says "countryCode as two uppercase letters". It conflicts with R18, R29 and TH line 86. QA does not edit the plan.
- **F4. Low. Decision.** Q14 is still open. The code rejects `UK` and `EU` because they are not in the assigned list (R18, "assigned in ISO 3166-1"). Sam must confirm this to close Q14.
- **F5. Info.** `as unknown as` at validation.ts line 92 is kept (see point 3). No change.
- **F6. Info. Decision.** `occurredAt` `24:00:00Z` is accepted (valid ISO 8601 end of day; `Date.parse` gives the next day, the calendar check uses the written day). Sam to confirm this is intended.

**Verdict: PASS.** F1 is closed. Re-review after FAIL (step 5), with Sam's decisions recorded:
- F1 (approved): test added as above. Only `test/validation.test.ts` changed in this step; no other test and no `src/` change.
- F2: no code comment. Provenance stays in `work/wave-02/reasoning.md`.
- F3: `plan/wave-02-building-blocks/AGENT.md` not edited. Open, Sam raises it with the user.
- F4 / Q14: UK and EU stay rejected. Confirmed by Sam.
- F5: the `as unknown as` cast is accepted as justified.
- F6: `24:00:00Z` stays accepted as valid ISO 8601. Confirmed by Sam.

Commands and results (this re-review):
- `npm.cmd run typecheck`: exit 0.
- `npm.cmd test -- validation`: 1 file, 149 of 149 tests pass (146 before, plus the 3 new header cases).
- `npm.cmd test`: 3 files, 193 of 193 tests pass.
- Manual header check via `tsx` on `src/domain/validation.ts`: `null`, `undefined`, `'text'` each return `{"ok":false,"errors":[{"field":"header","reason":"must list the six columns in order","line":1}]}` with no throw. The six-column header returns `{"ok":true,"value":null}`.

AC10 and R5: the code returns a failure result for `null`, `undefined` and primitives in all three validators, and the tests prove it for each. Every other check from the step 2 review is unchanged and still green.

**Next steps (all done at re-review)**
1. Done: Sam approved F1. QA added the test in `test/validation.test.ts`.
2. Done: typecheck, `validation` tests, full suite and the manual header check re-run. Verdict set to PASS.
3. Done: Sam decided F2, F4 and F6. F3 is left for Sam to raise with the user.

## retry-policy

**Status:** Step 5 re-run after F5 fix: **Verdict: PASS** (see the last subsection). Earlier: Step 2 again after FAIL, fifth round (F1 and F2 tests added as Sam approved; F3 test added for the clamp Sam decided, red until `src/` clamps; F4 not required). Earlier: Step 2 done, fourth round (OQ-10 and OQ-11 applied; boundary test "2147483" added and "9007199254740991" moved from the floor rows to the ignored rows per the confirmed OQ-11 decision; tests aligned to the final contract in `work/wave-02/requirements.md`, section "## retry-policy"). Red run captured: the suite does not load because `src/infra/retry.ts` does not exist yet. Step 5 done: verdict FAIL (see "### Step 5: review and gate (retry-policy)" at the end of this section). Q-R1 to Q-R11 and OQ-1 to OQ-9 are answered in requirements.md. OQ-10 (whitespace) is treated as `String.prototype.trim()`, per Sam relayed in this round; the tab test follows it.

**Sources:** `work/wave-02/requirements.md`, section "## retry-policy" (contract, R-retry, AC-retry, EC-retry, Sam decisions and OQ-1 to OQ-10). Config keys from `src/config.ts`. The fault inputs in `MOCK-ENVIRONMENT.md` are for Wave 3 client tests, not this unit suite.

### Test files

| File | Tests | Type |
|---|---|---|
| `test/retry.test.ts` | 63 | Unit. Fake clock (virtual time, records waits) and scripted operation. No network, no real sleeps. Settings come from `loadConfig`, not literals. |

Test count: 63. Each `it.each` row counts one: 8 retryable, 10 terminal HTTP statuses, 2 terminal network codes, 3 non-Error rejections, 3 Retry-After floor rows, 9 ignored Retry-After values. Plus two standalone OQ-11 boundary tests: Retry-After "2147484" (ignored, third round) and "2147483" (honoured, fourth round). Three standalone tests added in the fifth round after FAIL: RETRY_BASE_MS above RETRY_MAX_MS (F1), all three RETRY_* env vars stubbed (F2), and RETRY_MAX_MS above the timer limit (F3).

### Contract used by the tests (requirements.md, retry-policy, final)

- `withRetry(operation, config, { sleep })` exported from `src/infra/retry.ts`. `config` is the `Config` from `loadConfig`; the helper reads `retryMaxAttempts`, `retryBaseMs`, `retryMaxMs` and no env.
- Success `{ ok: true, value }`. Failure `{ ok: false, error }` with the terminal error, or the last error after the limit. Never throws.
- `operation` is called with no arguments.
- `sleep(ms)` is injected. Waits are in milliseconds. Final wait = max(jittered wait, Retry-After floor).
- Classification: a numeric `status` decides (429 and 503 retryable, all others terminal). Only with no status: `cause.code` in ECONNRESET, ECONNREFUSED, ETIMEDOUT, EAI_AGAIN, EPIPE, or `name` TimeoutError, is retryable. AbortError, ENOTFOUND, ECONNABORTED, and any error with no marker are terminal.
- Retry-After: floor applies on 429 only. Valid after `String.prototype.trim()`: `/^\d+$/` and no greater than Number.MAX_SAFE_INTEGER. Otherwise ignored, no floor. The floor is not capped by RETRY_MAX_MS.
- Full jitter: wait for retry n is in `[0, min(RETRY_MAX_MS, RETRY_BASE_MS * 2^(n-1))]`. Bounds are checked over 100 runs with the real `Math.random`.


### Test plan

| Test | AC | Ref |
|---|---|---|
| retries HTTP 429, HTTP 503, network codes ECONNRESET, ECONNREFUSED, ETIMEDOUT, EAI_AGAIN, EPIPE and TimeoutError; later success returned (8 rows) | AC-retry-03 | R-retry-08, R-retry-05 |
| does not retry HTTP 400, 404, 408, 409, 422, 500, 501, 502, 504, 505 (10 rows); one call, no wait, same error returned | AC-retry-02 | R-retry-09, R-retry-10 |
| does not retry network codes ENOTFOUND, ECONNABORTED (2 rows) | AC-retry-02, EC-retry-03 | R-retry-09 |
| does not retry an AbortError | AC-retry-02, EC-retry-05 | R-retry-09 |
| does not retry a domain rejection (no marker) | AC-retry-02 | R-retry-09 |
| does not retry a string, null or undefined rejection and does not throw (3 rows) | AC-retry-14 | R-retry-06, R-retry-09 |
| 404 with ECONNRESET is terminal; 503 with ENOTFOUND is retryable; 404 with TimeoutError is terminal | AC-retry-16 | R-retry-08 (precedence), OQ-4, OQ-8 |
| stops at a 404 after a 503: 2 calls, 1 wait, the 404 returned | EC-retry-04 | R-retry-10 |
| Retry-After floor applies for "5", "05", " 5" (3 rows): wait at least the floor | AC-retry-01, AC-retry-15 | R-retry-14 |
| a leading and trailing tab around Retry-After is trimmed and honoured (OQ-10) | AC-retry-15 | R-retry-14 |
| Retry-After "0" gives no floor: first wait within RETRY_BASE_MS | AC-retry-15, EC-retry-01 | R-retry-14, R-retry-16 |
| Retry-After "+5", "5.0", "1.5", "-1", "", "abc", an HTTP-date, "9007199254740991", "9007199254740992" (9 rows) are ignored: first wait within RETRY_BASE_MS | AC-retry-15, EC-retry-02 | R-retry-14, R-retry-16, OQ-11 |
| Retry-After "2147484" (ms value 2147484000, above 2147483647) is ignored: first wait within RETRY_BASE_MS, no floor | AC-retry-15, EC-retry-02 | R-retry-14, R-retry-16, OQ-11 |
| Retry-After "2147483" (ms value 2147483000, at the limit) is honoured: first wait at least 2147483000 ms | AC-retry-15, AC-retry-01 | R-retry-14, OQ-11 |
| Retry-After "10" with RETRY_MAX_MS 5000: wait at least 10000 ms | AC-retry-08 | R-retry-15 |
| Retry-After on 503 is ignored: first wait within RETRY_BASE_MS | AC-retry-09 | R-retry-17 |
| 429 without Retry-After has no floor: first wait within RETRY_BASE_MS | AC-retry-10 | R-retry-16 |
| calls the operation RETRY_MAX_ATTEMPTS times when every attempt is retryable | AC-retry-04 | R-retry-07, R-retry-11 |
| returns the last retryable error as a failure instead of throwing | AC-retry-04 | R-retry-11 |
| reads the attempt limit from RETRY_MAX_ATTEMPTS (`3` gives 3 calls) | AC-retry-04 | R-retry-07 |
| RETRY_MAX_ATTEMPTS `1`: one call, no wait, failure returned | AC-retry-05 | R-retry-07 |
| a RETRY_MAX_ATTEMPTS value in the environment is ignored; the config argument counts | AC-retry-12 | R-retry-03 |
| every RETRY_* env var stubbed (`RETRY_MAX_ATTEMPTS=1`, `RETRY_BASE_MS=1000000`, `RETRY_MAX_MS=1000000`; the test first asserts `loadConfig()` sees the stub): 2 calls, 1 wait, first wait within config.retryBaseMs (random pinned to 0.999) | AC-retry-12 (F2) | R-retry-03 |
| first retry wait with `RETRY_BASE_MS=10000` and `RETRY_MAX_MS=5000` (random pinned to 0.999): at most 5000 ms | EC-retry-07 (F1) | R-retry-12 |
| `RETRY_MAX_ATTEMPTS=26`, `RETRY_MAX_MS=3000000000` (random pinned to 0.999): 25 waits, none above 2147483647 ms | Sam F3 decision (clamp to timer limit) | R-retry-04 |
| the retry wait goes to the injected sleep in ms (Retry-After "1" gives `[1000]`) | AC-retry-13 | R-retry-04 |
| does not sleep after the final failed attempt | AC-retry-04 | R-retry-18 |
| does not sleep when the first attempt succeeds; the success is returned | AC-retry-11 | R-retry-05, R-retry-18 |
| the operation receives zero arguments on every attempt | AC-retry-17 | R-retry-02 |
| every jittered wait is in [0, ceiling(n)] over 100 runs | AC-retry-06 | R-retry-12, R-retry-13 |
| every jittered wait is at most RETRY_MAX_MS (`RETRY_MAX_ATTEMPTS=10`, `RETRY_MAX_MS=1000`) | AC-retry-07 | R-retry-12 |
| jittered waits spread below their ceiling instead of always using it | AC-retry-06 | R-retry-13 |

Note on Retry-After "1" in the sleep test: the floor (1000 ms) is above the jitter ceiling (200 ms), so the wait is exactly 1000 ms by max(jittered, floor).


### Red run

Command: `npm.cmd test -- retry`. Exit code 1. Run after the second-round edits.

Observed output:
```
 ❯ test/retry.test.ts (0 test)
 FAIL  test/retry.test.ts [ test/retry.test.ts ]
Error: Cannot find module '../src/infra/retry.js' imported from C:/Users/Miguel/Documents/Farfetch/test/retry.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

Command: `npm.cmd run typecheck`. Exit code 1. Only error: `test/retry.test.ts(3,45): error TS2307: Cannot find module '../src/infra/retry.js'`. Calls to `withRetry` and `RetryResult` are not type-checked until the module exists.

0 of 58 tests ran. The suite fails at load, so no test has yet been shown to fail on behaviour.

Third round (OQ-11 test added). Command: `npm.cmd test -- retry`. Exit code 1. Same load failure: `Error: Cannot find module '../src/infra/retry.js'`. 0 of 59 tests ran. The OQ-11 test has not yet been shown to fail on behaviour. Step 5 must confirm that the tests fail against a wrong implementation.

Fourth round (boundary test "2147483" added; "9007199254740991" moved to the ignored rows). Command: `npm.cmd test -- retry`, run once. Exit code 1. Same load failure: `Error: Cannot find module '../src/infra/retry.js' imported from C:/Users/Miguel/Documents/Farfetch/test/retry.test.ts`. 0 of 60 tests ran. The "2147483" test has not yet been shown to fail on behaviour. `src/infra/` does not exist yet.

Fifth round (F1, F2 and F3 tests added after Sam's decisions). Command: `npm.cmd test -- retry`, run once. Exit code 1. The suite loads (`src/infra/retry.ts` exists). Observed: `Tests 1 failed | 62 passed (63)`. The one failure is `withRetry full jitter > clamps every sleep delay to 2147483647 ms when RETRY_MAX_MS is above the timer limit`: `AssertionError: expected [ 2997000000 ] to deeply equal []`. This is the expected red for F3: the helper does not clamp the sleep delay yet (Sam decision). QA did not change `src/`. F1 and F2 pass on the current code. They were not mutation-checked in this round.


### Questions (answered in requirements.md, section "## retry-policy", "Answers to Tom's questions")

- **Q-R1 to Q-R11** Answered. The test file follows the answers: signature and config argument (Q-R2), error shape (Q-R3), 408, 500, 502, 504 terminal (Q-R4), five network codes (Q-R5), no-marker means terminal (Q-R6), RETRY_MAX_ATTEMPTS is total calls (Q-R7), first ceiling is RETRY_BASE_MS (Q-R8), floor not capped (Q-R9), Retry-After ignored on 503 (Q-R10).
- **Q-R11 docs/decisions.md** Not a test item. Dan writes it (R-retry-22, R-retry-23).

### Still open or to confirm

- **OQ-10 whitespace.** Sam decision: `String.prototype.trim()`. The existing tab test follows it. NBSP and other Unicode whitespace are stripped by `trim()`; no test covers them. requirements.md still shows OQ-10 as OPEN; Sam to write the decision into R-retry-14.
- **OQ-11 timer limit.** Sam decision: a Retry-After whose ms value (seconds x 1000) is above 2147483647 is ignored, with no floor and the jittered delay used. The new test uses "2147484" (2147484000 ms) and checks the first wait is at most RETRY_BASE_MS, the same bound as the other ignored Retry-After tests. The file has no fake random, so exact equality with the jittered draw is not asserted. requirements.md now has the OQ-11 entry (section "## retry-policy", OQ-11 line). The accepted side of the limit ("2147483", 2147483000 ms) now has one test (fourth round), so both sides of the limit are covered.
- **Terminal 500, 502, 504** follow SAM 4 and are flagged for user review in requirements.md (R-retry-09). Tests follow the contract as written.

### Step 5: review and gate (retry-policy)

Tom, 2026-11-06. Reviewed `src/infra/retry.ts`, `test/retry.test.ts`, `docs/decisions.md` against `requirements.md` "## retry-policy" (R-retry, AC-retry, EC-retry) and `.github/instructions/code-style.instructions.md`.

**Verdict: FAIL.** Two blocking gaps in test coverage of listed items (F1, F2). The code is correct for both. Two Low non-blocking items (F3, F4) and one decision for Sam.

**Commands run and observed**

| Command | Result |
|---|---|
| `npm.cmd run typecheck` | exit 0, no output errors |
| `npm.cmd test -- retry` | 1 file, 60 of 60 passed (run before and after the mutation checks) |
| `npm.cmd test` | 4 files, 253 of 253 passed |
| `node node_modules\typescript\bin\tsc -p tsconfig.json --noEmit` (build check, no emit, so `dist/` is untouched) | exit 0 |
| `git status` / SHA-256 of `src/infra/retry.ts` before and after mutations | `BC4137CD...5D42BE` before, same hash after restore. `src/` has no change from Tom. |

Manual tests (curl, WireMock, live service): not run. `withRetry` is not wired to any route or HTTP client in this wave (Wave 3 wires it), so there is no running endpoint that exercises it. The fault inputs in MOCK-ENVIRONMENT.md are Wave 3 client tests, as stated in "Expected tests".

**Review against the code style and the contract**

- No `any`. Module boundaries have explicit types (`withRetry` return type, `sleep` signature, `RetryResult`, `isRetryable`, `retryDelayMs`, `retryAfterFloorMs`).
- No `throw` in `src/infra/retry.ts`. Non-object rejections go through `fieldsOf` and are terminal (AC-retry-14).
- Attempt limit: `attempt >= config.retryMaxAttempts` (total calls, R-retry-07). No wait after the final failure or a terminal stop (R-retry-18).
- Classification order: numeric `status` decides first; network codes and `TimeoutError` only without a status (R-retry-08, OQ-4, OQ-8). Set contents match OQ-5 and OQ-2.
- Retry-After: read only on 429 (`retryAfterFloorMs`); `trim()`, then `/^\d+$/`, then `ms <= maxTimerMs` (2147483647) (R-retry-14, OQ-9, OQ-10, OQ-11). Floor is not capped by `retryMaxMs` (R-retry-15).
- Backoff: `min(retryMaxMs, retryBaseMs * 2^(retry-1))` with `Math.random()` in `[0, ceiling]` (R-retry-12, R-retry-13).
- Config: values come only from the `config` argument. No `process.env` in the helper (R-retry-03). No hard-coded defaults in the helper.
- Sleep is injected via `{ sleep }`; the helper has no timers of its own (R-retry-04).
- Comment: one line, only where the why is not obvious (the timer limit). No dead code, no TODO, no commented-out code.
- Tests: 60 cases cover AC-retry-01 to AC-retry-17 (checked row by row against the file) and EC-retry-01 to EC-retry-06, EC-retry-08, EC-retry-09 (docs input) and EC-retry-10. EC-retry-07 and the single-variable part of AC-retry-12 are not covered (F1, F2). Terminal cases assert one call, no wait and the same error object (AC-retry-02, R-retry-10). Fake clock; no real sleeps (AC-retry-13).

**Docs (`docs/decisions.md`)**

- Defaults are presented as engineering choices, not assignment values, with a reason for each (attempts, base, cap, full jitter, uncapped Retry-After). The waits quoted (200, 400, 800, 1600 ms; about 3 s total) match the config defaults.
- Classification section matches the code.
- 500, 502 and 504 are marked "Open for user review" (line "Open for user review: 500, 502 and 504 are terminal by default."). Confirmed present.

**Mutation check (temporary edits to `src/infra/retry.ts`, backup in `%TEMP%\retry.ts.orig`, restored, hash verified identical)**

| # | Mutation | Tests failing (`npm.cmd test -- retry`) | Result |
|---|---|---|---|
| M1 | Remove the Retry-After ignore above the limit (`return ms;`) | 3: `"9007199254740991"`, `"9007199254740992"`, `"2147484"` | Caught |
| M2 | Treat 404 as retryable (`new Set([404, 429, 503])`) | 4: `does not retry HTTP 404`, 404 with ECONNRESET, 404 with TimeoutError, 404 after 503 (EC-retry-04) | Caught |
| M3 | Allow one extra attempt (`attempt > config.retryMaxAttempts`) | 7: max-attempts calls, last-error return, `RETRY_MAX_ATTEMPTS=3`, `=1`, env-ignored, no sleep after final, jitter count | Caught |

**Findings**

- **F1, Medium, blocking.** EC-retry-07 (RETRY_BASE_MS above RETRY_MAX_MS) has no test. `grep` of `test/retry.test.ts` shows no override of `RETRY_BASE_MS`. The code is correct: `Math.min(config.retryMaxMs, ...)` makes the first ceiling RETRY_MAX_MS. Fix (test only): add one test, for example `loadConfig({ RETRY_BASE_MS: '10000', RETRY_MAX_MS: '5000' })` with `collectRetryWaits`, asserting the first retry wait is at most 5000 ms.
- **F2, Low, blocking.** AC-retry-12 says "Changing RETRY_* environment variables does not change the helper's behaviour". The test (`ignores RETRY_MAX_ATTEMPTS in the environment`, line ~306) stubs only `RETRY_MAX_ATTEMPTS`. A helper that read `RETRY_BASE_MS` or `RETRY_MAX_MS` from env would still pass. Fix (test only): stub all three `RETRY_*` variables to values that would change behaviour (for example `RETRY_BASE_MS` set to 1000000) and assert the first retry wait stays within `config.retryBaseMs`.
- **F3, Low, non-blocking.** `RETRY_MAX_MS` is accepted up to `Number.MAX_SAFE_INTEGER` (`src/config.ts`, `readPositiveInteger` default). A ceiling above 2147483647 would reach the real `setTimeout` and fire immediately. No AC covers this, and the defaults are far below it. Decision for Sam (see below).
- **F4, Low, optional nit.** `isRetryable` in `src/infra/retry.ts` calls `fieldsOf(error)` twice. `const { status, name, cause } = fieldsOf(error)` and `fieldsOf(cause).code` would read more simply. Not a style rule violation.

**Decisions Sam must make**

1. 500, 502 and 504 are terminal (SAM 4). The user must confirm before Wave 3 relies on them. Already flagged in `docs/decisions.md`.
2. F3: cap the ceiling below the timer limit (for example, in `config.ts` or in `retryDelayMs`), or accept that `RETRY_MAX_MS` above 2147483647 is out of range. Not blocking this gate.
3. Route F1 and F2 back to Tom (Phase 1 test fix). Tom may not edit `src/`, and this step may not edit `test/`. Re-run the gate after the test change.

**Hand-off check**

Reasoning.md says: typecheck exit 0, retry 60 tests, full suite 253 tests in 4 files, no package installs. All confirmed above. The "Test file not modified" note is accurate for Dan; the test file was written by Tom in Phase 1.

### Step 5 re-review after FAIL (retry-policy, Tom, 2026-11-06)

**Verdict: FAIL.** One item open: F2 is not fully closed (F5 below). F1 and F3 are closed.

**Commands run and observed**

| Command | Result |
|---|---|
| `npm.cmd run typecheck` | exit 0, no errors |
| `npm.cmd test -- retry` | 1 file, 63 of 63 passed |
| `npm.cmd test` | 4 files, 256 of 256 passed |

No packages installed. `src/` and `test/` not edited.

**Checks**

1. F1 (EC-retry-07): closed. Test "caps the first retry wait at RETRY_MAX_MS when RETRY_BASE_MS is above it" uses `RETRY_BASE_MS=10000`, `RETRY_MAX_MS=5000`, random pinned to 0.999, and asserts the first wait is at most 5000. Passes.
2. F2 (AC-retry-12): not closed. The test "ignores every RETRY_* environment variable..." stubs all three variables and asserts `loadConfig().retryBaseMs === 1000000`, which proves the stub is seen. `RETRY_MAX_ATTEMPTS=1` and `RETRY_BASE_MS=1000000` each change the asserted outcome. `RETRY_MAX_MS=1000000` does not: the first ceiling is `min(retryMaxMs, retryBaseMs × 2^0) = min(…, 200)`, so a helper that read `RETRY_MAX_MS` from the environment would still pass. F2 named this variable explicitly.
3. F3: closed. `src/infra/retry.ts` applies `Math.min(retryDelayMs(...), maxTimerMs)` with `maxTimerMs = 2147483647` to the result of `Math.max(jitter, floor)`, so the clamp covers both the jittered delay and the Retry-After floor. The floor is already limited to `≤ maxTimerMs` by `retryAfterFloorMs`. The test "clamps every sleep delay to 2147483647 ms..." (`RETRY_MAX_ATTEMPTS=26`, `RETRY_MAX_MS=3000000000`, random 0.999) asserts 25 waits, none above the limit. Without the clamp, retry 25 would wait 2.997e9 ms, so the test catches a missing clamp.
4. Code style: one comment in `retry.ts` (the timer-limit why). No TODO, no commented-out code, no `any`, no `process.env` in the helper, no dead code found. F4 (duplicate `fieldsOf` call) remains; Sam marked it optional, so it is not a finding.
5. Sam decisions: the classification, Retry-After, timer-limit and config-argument rules in `retry.ts` match the contract in requirements.md ("## retry-policy").

**Findings**

- **F5, Low, blocking (F2 not fully closed).** In `test/retry.test.ts`, the test "ignores every RETRY_* environment variable and keeps the first wait within config.retryBaseMs" stubs `RETRY_MAX_MS` to `1000000`, which cannot change the first wait (see check 2). A helper reading `RETRY_MAX_MS` from the environment passes the suite. Fix (test only): stub `RETRY_MAX_MS` to a value below the default first ceiling, for example `'100'`, and add `expect(waits[0]).toBeGreaterThan(100)` next to the existing upper bound. With the random value pinned to 0.999, the config first wait is 199.8 ms, so the test passes with the config and fails if the environment value is read (99.9 ms).

**Hand-off check:** the Step 5 notes above are accurate for this round. Verdict FAIL until F5 is fixed and the gate is re-run.

### Step 5 re-run after F5 fix (retry-policy, Tom, 2026-11-06)

**Verdict: PASS.** F1, F2 (closed by F5) and F3 are closed. F5 is closed. The retry suite and typecheck are green.

**Change:** test "ignores every RETRY_* environment variable and keeps the first wait within config.retryBaseMs" in `test/retry.test.ts` (Sam approved). `RETRY_MAX_MS` is now stubbed to `'100'` (was `'1000000'`). Added `expect(loadConfig().retryMaxMs).toBe(100)` to prove the stub is seen, `expect(waits[0]).toBeGreaterThan(100)`, and kept `expect(waits[0]).toBeLessThanOrEqual(config.retryBaseMs)`. Random pinned to 0.999, so the config first wait is 199.8 ms. No change to `src/` or `requirements.md`.

**Commands run and observed**

| Command | Result |
|---|---|
| `npm.cmd test -- retry` | exit 0, 1 file, 63 of 63 passed |
| `npm.cmd run typecheck` | exit 0, no errors |

No packages installed.

**Mutation check (reasoned from the code, `src/` not edited).** `src/infra/retry.ts` does not read `process.env`. If it read `RETRY_MAX_MS` as `'100'`, the first ceiling would be `min(100, 200) = 100`, and with random 0.999 the first wait would be 99.9 ms. `expect(waits[0]).toBeGreaterThan(100)` then fails. The test passes with the config value (199.8 ms). Reading `RETRY_BASE_MS` or `RETRY_MAX_ATTEMPTS` from the environment also fails this test (the existing 1000000 and 1 assertions).

**Manual tests:** not run. `withRetry` is not wired to any route or client in Wave 2, so there is no endpoint to exercise. Same as the earlier round.

## sqlite-schema

**Status:** Step 2 done (tests first). Red run captured. Step 5 (review and gate) not started. No verdict yet.

**Sources:** `plan/wave-02-building-blocks/AGENT.md`, task "sqlite-schema" (What to do, Acceptance, DoD table). `work/wave-02/requirements.md` has **no "sqlite-schema" section**; it only covers input-validation and retry-policy. AGENT.md is the spec for this task (see Q-S1). Config: `src/config.ts` has `dbPath` (`DB_PATH`, default `./data/processor.db`). The tests do not read config: they use `:memory:` and temp files, so no config key is needed.

**Assumed contract (not in any document yet; see open questions):** `openDatabase(path: string)` exported from `src/infra/db.ts`. It takes a path (`':memory:'` allowed), applies `src/infra/schema.sql` on every open, sets `foreign_keys = ON` and `journal_mode = WAL` for file databases, and returns a better-sqlite3 `Database`. The test file takes the return type from `ReturnType<typeof openDatabase>`.

### Test files

| File | Tests | Type |
|---|---|---|
| `test/db.test.ts` | 24 | Unit. In-memory database and temp-folder file database (removed in `afterEach`). Opened databases are closed in `afterEach`. Goes through `openDatabase` only. |

Count: 24 (2 migration, 6 contract tables and columns: 1 table set and 5 `it.each` rows, 3 stock_versions key, 3 outbox, 2 stock_leases key, 3 foreign keys and WAL, 5 one-insert-per-table).

### Test plan

| Test | AC (AGENT sqlite-schema) | DoD row |
|---|---|---|
| applies the schema again without error when the same file is opened a second time | AC1 schema applies twice | Schema applies twice |
| keeps stock_leases rows when the schema is applied again | AC1 (data survives a second migration) | Schema applies twice |
| creates exactly the five contract tables | Tables | Row per table / contract names |
| creates %s with the columns named in the contract (5 rows: stock_versions, import_jobs, import_rows, outbox, stock_leases) | Tables and columns | Contract names |
| uses seller_id, product_id, size_id and country_code as the composite primary key | Composite key of stock_versions | Contract names |
| rejects a second stock_versions row with the same seller, product, size and country | Composite key | Contract names |
| accepts stock_versions rows that differ only by country_code | Composite key (country is part of the key) | Contract names |
| has an index on (published_at, id) for the publisher scan | AC2 outbox index | Index and keys |
| rejects a second outbox row with the same event_id | Outbox unique event_id | Contract names |
| does not reuse an outbox id after the newest row is deleted | Outbox autoincrement id | Contract names |
| uses stock_key as the primary key | AC3 stock_leases primary key | Index and keys |
| rejects a second lease row for the same stock_key | AC3 (behaviour of the key) | Index and keys |
| enables foreign key enforcement on an in-memory database | Foreign keys on (PRAGMA check on :memory:) | — |
| rejects an import_rows row whose job_id has no import_jobs row | Foreign keys on (depends on Q-S4) | — |
| sets journal mode to wal on a file database | WAL mode (temp folder file, removed after) | — |
| accepts one stock_versions row on an in-memory database | AC4 one insert per table | Row per table |
| accepts one import_jobs row on an in-memory database | AC4 | Row per table |
| accepts one import_rows row on an in-memory database | AC4 (inserts a parent import_jobs row first) | Row per table |
| accepts one outbox row on an in-memory database | AC4 | Row per table |
| accepts one stock_leases row on an in-memory database | AC4 | Row per table |

### Assumptions the tests encode (confirm or correct; see open questions)

- `import_jobs` insert uses `job_id` and `state` only, `state` = `'queued'`. Counters and timestamps are not named anywhere, so the test does not check or insert them.
- `import_rows` insert uses `line_number` 2, `outcome` `'accepted'`, `reason` `NULL`.
- `outbox` insert uses `published_at` `NULL`, `attempts` `0`, `last_error` `NULL`. The publisher index on (published_at, id) implies `published_at` is nullable.
- `stock_versions.applied_source_version` takes an integer (1 inserted).
- Table set is exactly the five contract tables (`sqlite_*` internal tables excluded).
- `stock_versions` primary key order is seller_id, product_id, size_id, country_code (spec order).
- The outbox index is checked by its column list only, not by name.

### Red run

Command: `npm.cmd test -- db`. Exit code 1. Run after the file was written; the module does not exist yet.

Observed output:
```
 ❯ test/db.test.ts (0 test)
 FAIL  test/db.test.ts [ test/db.test.ts ]
Error: Cannot find module '../src/infra/db.js' imported from C:/Users/Miguel/Documents/Farfetch/test/db.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

0 of 24 tests ran. The suite fails at load, so no test has yet been shown to fail on behaviour. `node_modules` already has `better-sqlite3` 13.0.3 and `@types/better-sqlite3`; no packages were installed.

### Open questions for Sam

- **Q-S1 (missing spec).** `work/wave-02/requirements.md` has no "sqlite-schema" section. I used AGENT.md as the spec. Please confirm, or add a section.
- **Q-S2 (opener name and signature).** Nothing names the opener. I assumed `openDatabase(path: string)` in `src/infra/db.ts`, returning a better-sqlite3 `Database` with migrations applied and pragmas set. Confirm the name, and whether it returns the `Database` or a wrapper.
- **Q-S3 (import_jobs columns).** AGENT lists "counters, timestamps" without column names. The test checks only `job_id` and `state`. Please give the counter and timestamp column names, their types, whether they are NOT NULL, and the `state` values. Until then the import_jobs insert is an assumption.
- **Q-S4 (import_rows foreign key and vocabulary).** Is `import_rows.job_id` a foreign key to `import_jobs.job_id`? The orphan-row test assumes yes; remove it if no. Also: the `outcome` values, and whether `reason` is nullable.
- **Q-S5 (outbox nullability and defaults).** Is `published_at` nullable (NULL = not yet published)? Is `attempts` defaulted to 0? Is `last_error` nullable? The test inserts explicit values.
- **Q-S6 (extra tables).** The test requires exactly the five contract tables. If the migration needs a version or migrations table, tell me and I will allow it.
- **Q-S7 (stock_versions key order).** Test expects the primary key in the spec order (seller_id, product_id, size_id, country_code). Confirm this order is not a contract, or tell me to compare as a set.

No change to `src/` or `requirements.md`. Next: wait for Dan's implementation and Sam's answers; then Step 5 review, typecheck, build, tests and manual checks.
