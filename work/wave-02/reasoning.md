# Wave 02 reasoning (Dan)

## input-validation

**Done.** Created `src/domain/validation.ts` (pure validators: `validateSellerInventoryChanged`, `validateCsvHeader`, `validateCsvRow`, plus exported `ValidationError`, `ValidationResult`, `SellerInventoryChanged`, `SellerInventoryRow`) and `src/domain/countryCodes.ts` (static ISO 3166-1 alpha-2 set). Tests in `test/` not modified.

**Decisions and reasons**
- countryCode (Q1, Q14): passes only if the code is in the official ISO 3166-1 alpha-2 list of assigned codes. Reason: the assignment says ISO alpha-2, and the change request overrides `/^[A-Z]{2}$/`. Exceptionally reserved codes (`UK`, `EU`) and unassigned pairs (`XX`, `ZZ`) are rejected, since neither is in the list.
- ISO list source: the `ISO3166-1-Alpha-2` column of `datasets/country-codes` (GitHub, `data/country-codes.csv`), downloaded 2026-11-06. It gives 249 codes. I checked the constant against that extraction: 249 entries, 0 differences. Static constant, no new dependency (Sam approved).
- One rule for event and CSV countryCode (`countryCodeCheck`), one set. Lowercase, three letters, padding and non-strings all fail via the set lookup.
- Event and row checks are declared as tables keyed by field (`Record<keyof SellerInventoryChanged, Check>` and by CSV column). The key type makes the compiler flag a missing event field.
- Number cells: `/^\d+$/` and `Number.isSafeInteger(Number(cell))`, value via `Number(cell)` (Q2, Q3). Event numbers: `typeof` number, safe integer, `>= 0`.
- `occurredAt`: regex for the full date-time with zone, then `Date.parse`, then a calendar-field check. The check is needed because `Date.parse` accepts day 30 in February.
- Guards: `Array.isArray` and `typeof` checks run before any field access, so no input throws.
- `validateSellerInventoryChanged` returns the event object as given (Q2). The extra-keys test needs the original object, so the result is cast through `unknown` after the field checks pass.

**Alternatives rejected**
- A third-party ISO package: a new dependency, outside the brief.
- Reading the list from `Intl`: it cannot list region codes.
- Keeping `/^[A-Z]{2}$/` with a note: contradicts the assignment.

**Deviations from brief:** none in behaviour. `countryCodes.ts` is an extra file, approved by Sam.

**Results**
- `npm.cmd run typecheck`: exit 0. The first run failed on a direct `Record` to interface cast (TS2352). Fixed with `as unknown as`.
- `npm.cmd test -- validation`: 1 file, 146 tests passed on my first run. Tom then added test F1 (`validateCsvHeader` with `null`, `undefined`, `'text'`). F1 was added after the first review, so it was not red at that point. Final count: 149 validation tests passed.
- `npm.cmd test` (full): 193 tests passed across 3 files at task close (before retry-policy). Wave 1 still green.
- No package installs.

## retry-policy

**Done.** Created `src/infra/retry.ts` exporting `withRetry` and `RetryResult`. Created `docs/decisions.md` (retry defaults and classification; 500/502/504 terminal marked open for user review). Test file not modified.

**Decisions and reasons**
- Classification follows the requirements order: numeric `status` decides; network codes and `TimeoutError` are checked only without a status. Reason: SAM OQ-4 and OQ-8.
- Retry-After is read on 429 only, after `trim()`, digits only, and ignored when the ms value exceeds 2147483647. Reason: SAM OQ-1, OQ-9, OQ-10, OQ-11. The ms check also covers values above `Number.MAX_SAFE_INTEGER`.
- The helper reads error fields through one `fieldsOf` guard, so string, `null` and `undefined` rejections are terminal and never throw. Reason: SAM 6, AC-retry-14.
- The wait is `max(random × ceiling, floor)`. Reason: full jitter (SAM 8) and the floor rule (SAM 9).
- The delay passed to `sleep` is clamped to `maxTimerMs` (2147483647 ms), after the floor and jitter, because `setTimeout` fires immediately above that value (F3, Sam decision). Retry-After values above the limit are still ignored, not clamped (OQ-11).

**Alternatives rejected**
- An injected random source: the tests check bounds with the real `Math.random`, so the extra dependency was not needed.
- A named `RetryDeps` type: the signature stays inline, as the contract shows it.

**Deviations from brief:** none. `src/infra/` and `docs/` are new folders, as the brief requires.

**Results**
- `npm.cmd run typecheck`: exit 0.
- `npm.cmd test -- retry`: 1 file, 63 tests passed.
- `npm.cmd test`: 4 files, 256 tests passed.
- No package installs.
