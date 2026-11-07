# Requirements: input-validation

**Wave:** 02 Building blocks. **Task id:** input-validation. **Owner:** Poppy (PO). **Date:** 2026-11-06. **Status:** Sam's decisions recorded in section 10. Q1 resolved by change request (ISO 3166-1 alpha-2). Q14 resolved by Sam's decision (official ISO 3166-1 alpha-2 list of assigned codes; exceptionally reserved codes such as `UK` or `EU` fail).

**Goal:** pure validation functions for the `SellerInventoryChanged` event and for the bulk CSV header and rows. They return result objects and never throw. Wave 3 uses them without changes.

## 1. Sources

| Tag | Source |
|---|---|
| AGENT | `plan/wave-02-building-blocks/AGENT.md`. Section names are cited in brackets. |
| TH | `Take-Home Exercise_ Size-Level Availability Processor.md` (repo root). Section numbers as in the file. |
| SAMPLE | `wiremock/__files/sample-event.json` |
| CSVF | `wiremock/__files/bulk-stock.csv` |
| SAM | Sam's decisions for this task, relayed in this run. Fixed. They settle the open questions Poppy raised. |

**PDFs not read.** `plan/OVERVIEW.pdf` and `Take-Home Exercise_ Size-Level Availability Processor.pdf` are binary. The view and grep tools return no readable text. No requirement cites them. The `.md` copy of the take-home is used instead (Q12, settled).

## 2. Scope

**In scope**
- `src/domain/validation.ts` and `test/validation.test.ts` (AGENT "Files").
- Field rules for the event, the CSV header and the CSV row.
- Line-number reporting for CSV errors.

**Out of scope**
- Version comparison. A row or event with a lower `sourceVersion` is valid here. Stale handling is a Wave 3 concern (TH section 5, "Stale bulk rows").
- Parsing the CSV file. "Do not parse the CSV file itself" (SAM).
- Stopping processing after a header failure. This wave only returns the failure. The caller in Wave 3 must stop (AGENT "Acceptance", first box).
- Config reads, I/O, HTTP, database.

## 3. Functions and types

Requirements below use these names. Names are from AGENT and SAM.

```ts
export interface ValidationError { field: string; reason: string; line?: number }
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };

export function validateSellerInventoryChanged(event: unknown): ValidationResult<SellerInventoryChanged>;
export function validateCsvHeader(columns: string[]): ValidationResult<null>;   // Q2
export function validateCsvRow(cells: string[], lineNumber: number): ValidationResult<{ sellerId: string; productId: string; sizeId: string; countryCode: string; availableQuantity: number; sourceVersion: number }>; // Q2
```

- **R1 Files.** Code in `src/domain/validation.ts`. Tests in `test/validation.test.ts`. Source: AGENT "Files".
- **R2 Function names.** The three functions above, exported. Source: AGENT "What to do" (`validateSellerInventoryChanged`, `validateCsvHeader`, `validateCsvRow`); SAM ("validateCsvHeader(columns: string[])", "validateCsvRow(cells: string[], lineNumber: number)").
- **R3 Types exported.** `ValidationError` and the result type are exported. Names of the result type and the event type are free; tests must not depend on them. Source: SAM ("Export the types").
- **R4 Purity.** No I/O, no config reads, no network, no database. Source: SAM ("Purity"); AGENT "Implement pure validation functions with no I/O".
- **R5 Never throw.** Each function returns a result for any input, including `null`, `undefined`, numbers, strings, arrays and objects with missing keys. Source: SAM ("no throws"); AGENT "Functions return result objects and never throw".

## 4. Result shape and errors

- **R6 Success.** `{ ok: true, value }`. No `errors` key is required. Source: SAM ("Result shape").
- **R7 Failure.** `{ ok: false, errors }`, where `errors` has at least one `ValidationError`. Source: SAM ("Result shape").
- **R8 Error shape.** `ValidationError = { field: string; reason: string; line?: number }`. `field` and `reason` are non-empty strings. `reason` wording is free; tests check that it is non-empty. Source: SAM ("Result shape"); AGENT "Acceptance" ("Field-level errors include the field name and a reason").
- **R9 Collect all.** For one event or one row, every failing field produces an error. Validation does not stop at the first failure. Source: SAM ("Errors").
- **R10 Order.** The order of `errors` is not specified. Tests must not depend on it. Source: derived from SAM; no source gives an order.
- **R11 Line on errors.** `line` is set only on CSV errors (R31, R32). Event errors do not carry a `line` key. Source: SAM ("line?: number"; "validateCsvRow ... sets line on every error").

## 5. Event rules: validateSellerInventoryChanged

**Required fields.** All ten fields must be present: `eventId`, `eventType`, `schemaVersion`, `occurredAt`, `sellerId`, `productId`, `sizeId`, `countryCode`, `availableQuantity`, `sourceVersion`. Source: TH section 3 ("Receive an input event"), the JSON example; AGENT "Shared context" (list of event fields); AGENT "What to do" ("checks required fields").

- **R12 Missing field.** A missing field is a failure with `field` equal to the field name. Source: AGENT "Definition of Done" ("Missing field ... return the field name and a reason").
- **R13 Non-object input.** `null`, `undefined`, a primitive, or an array returns one error with `field: "event"`. No other errors are added. Choice recorded per SAM ("use field 'event' or 'row' as you choose"). Arrays included (Q8b).
- **R14 String fields.** `eventId`, `sellerId`, `productId`, `sizeId` must be strings that are non-empty after trim (`String.prototype.trim`). Whitespace-only fails. Source: SAM ("Strings"). A non-string value fails on that field (Q6, settled).
- **R15 eventType.** Must equal `"SellerInventoryChanged"` exactly (case-sensitive). Any other value is a field error on `eventType`. Source: SAM ("Event values"); SAMPLE `"eventType": "SellerInventoryChanged"`; AGENT "Acceptance" ("eventType and schemaVersion match sample-event.json").
- **R16 schemaVersion.** Must equal the JavaScript number `1`. Any other value (including `"1"`, `1.5`, `2`, `0`) is a field error on `schemaVersion`. Source: SAM ("Event values"); SAMPLE `"schemaVersion": 1`; AGENT "Acceptance".
- **R17 occurredAt.** Must be a full ISO-8601 date-time: date, `T`, time, and a zone designator (`Z`, `+hh:mm` or `-hh:mm`). Fractional seconds allowed. Date-only fails. Calendar-impossible dates (e.g. `2026-02-30`) fail. Source: SAM ("Strings"; Q5 decision); TH section 3 example `"2026-10-20T08:00:00Z"`.
- **R18 countryCode.** Must be a string that is an ISO 3166-1 alpha-2 code: two uppercase letters, assigned in ISO 3166-1. `"PT"` passes. `"pt"`, `"PTT"`, `"P1"`, `""` and `"PT "` fail. Unassigned pairs `"XX"` and `"ZZ"` fail. Source: TH section 3, line 86 ("`countryCode` is a two-letter ISO 3166-1 alpha-2 code"). Sam's change request (Q1, resolved) overrides the earlier `/^[A-Z]{2}$/` rule. AGENT "What to do" still says "two uppercase letters" (see Q1). The list is the official ISO 3166-1 alpha-2 list of assigned codes; exceptionally reserved codes such as `UK` or `EU` fail (Q14).
- **R19 availableQuantity.** Must be a JavaScript number, pass `Number.isSafeInteger`, and be `>= 0`. Strings are rejected, even digit-only strings. No other upper bound. Source: SAM ("Integers"); AGENT "What to do" ("integer of at least 0"); TH section 3 example `3`.
- **R20 sourceVersion.** Must be a JavaScript number, pass `Number.isSafeInteger`, and be `>= 0`. Strings are rejected. No other upper bound. Source: SAM ("Integers"); AGENT "What to do" ("sourceVersion as an integer"); AGENT "Shared context" (monotonic version).
- **R21 Fault-input values.** Values used by the provided mocks are valid when they meet the rules above. Examples: `eventId` `fault-429`, `fault-503`; `productId` `style-90001`, `style-9999`; `sellerId` `seller-429`, `seller-503`. Validation must not reject them. Source: AGENT "Shared context" (fault inputs). Fault handling is downstream.
- **R22 Extra keys.** Keys outside the ten fields are ignored. An event with an extra key is valid. Source: Q4 (settled).

## 6. CSV header rules: validateCsvHeader

- **R23 Exact header.** `columns` must equal, in this order, exactly: `sellerId`, `productId`, `sizeId`, `countryCode`, `availableQuantity`, `sourceVersion`. Source: SAM ("validateCsvHeader"); AGENT "What to do"; TH section 4 ("Accept an upload"); CSVF line 1.
- **R24 No trimming, no case change.** Cells are compared as given. `" sellerId"`, `"sellerid"`, or `"sourceVersion\r"` fail. Source: SAM ("with no trimming"). Case rule: derived from "exact" in SAM. The caller strips line endings before the call (Q9).
- **R25 Single header error.** Any mismatch (wrong order, wrong count, missing, extra or changed name) returns one error with `field: "header"` and `line: 1`. Choice recorded per SAM ("A header mismatch uses field 'header' and line 1"). Confirmed (Q11).
- **R26 Header error reason.** Non-empty. Wording free.

## 7. CSV row rules: validateCsvRow

Cell order is the header order in R23. Source: SAM; TH section 4; CSVF line 2 (`seller-001,style-1,size-34,PT,0,1`).

- **R27 Cell count.** `cells` must have exactly 6 entries. Any other count returns one error with `field: "row"` and `line: lineNumber`. Non-array `cells` gives the same error (Q8c). Only this error is returned; no per-field checks run (Q7).
- **R28 String cells.** `sellerId`, `productId`, `sizeId` cells must be non-empty after trim (R14 rule). Source: SAM ("validateCsvRow ... checks each field").
- **R29 countryCode cell.** Must be an ISO 3166-1 alpha-2 code under the R18 rule, checked as given with no trim. `"PT"` passes. `"pt"`, `"PTT"`, `""`, `" PT"`, `"XX"` and `"ZZ"` fail. Source: TH section 3, line 86 (same field); TH section 4, line 208 (CSV header uses `countryCode`); SAM ("countryCode"; "validateCsvRow ... each field"). Sam's change request (Q1, resolved).
- **R30 Number cells.** `availableQuantity` and `sourceVersion` cells are strings. Valid only if the cell matches `/^\d+$/` and `Number(cell)` passes `Number.isSafeInteger`. Cells are not trimmed. Source: SAM ("CSV cells are strings"); `availableQuantity >= 0` and `sourceVersion >= 0` hold for digits-only cells (SAM "Integers").
  - Leading zeros are valid by the regex. The value is `Number(cell)`, so `"007"` gives `7` (Q3).
  - Each invalid cell gives its own error with `field` equal to the column name.
- **R31 Line number.** Every error from `validateCsvRow` has `line` equal to the `lineNumber` argument. Source: SAM ("sets line on every error").
- **R32 Line for header.** Every error from `validateCsvHeader` has `line: 1`. Source: SAM ("header ... line 1").

## 8. Line numbers

- **R33 Meaning.** `line` is the physical line in the CSV file. The header is line 1. The first data row is line 2. Source: SAM ("Line numbers").
- **R34 Caller supplies it.** `validateCsvRow` does not compute the line. It uses the argument as given and does not validate it (Q8a). Source: SAM (signature `validateCsvRow(cells, lineNumber)`).
- **R35 Example.** For `CSVF` line 2 (first data row) and line 10001 (last data row), an error reports the same line number as the argument. Source: CSVF (10,001 lines: one header and 10,000 data rows); TH section 4 ("10,000-row").

## 9. Acceptance criteria

Each criterion is testable. Sources are in brackets.

- **AC1** Every failure result has at least one error. Every error has a non-empty `field` and a non-empty `reason`. [AGENT "Acceptance" box 1; SAM "Result shape"]
- **AC2** The SAMPLE event (`wiremock/__files/sample-event.json`) returns `ok: true`. [AGENT "Definition of Done" "Valid event accepted"; AGENT "Acceptance" box 3]
- **AC3** The SAMPLE event has `eventType` `"SellerInventoryChanged"` and `schemaVersion` `1`. Changing either to another value makes the event fail on that field. [AGENT "Acceptance" box 3; SAM "Event values"]
- **AC4** Missing each of the ten required fields, one at a time, fails on that field name. [AGENT "Definition of Done" "Field errors"; R12]
- **AC5** `countryCode` must be an ISO 3166-1 alpha-2 code. `"PT"` passes. `"pt"` fails on `countryCode`. Unassigned `"XX"` fails on `countryCode`. [TH section 3, line 86; AGENT "Definition of Done" "Field errors"; Sam's change request (Q1)]
- **AC6** `availableQuantity` `-1` and `1.5` each fail on `availableQuantity`. [AGENT "Definition of Done" "Field errors"; SAM "Integers"]
- **AC7** An event with three bad fields returns three errors, one per field. [SAM "Errors"]
- **AC8** A CSV header in a wrong order fails with `field: "header"` and `line: 1`, and the function returns before any row is validated. The return-before-rows part is a caller rule (section 2). [AGENT "Definition of Done" "Header mismatch"; AGENT "Acceptance" box 2]
- **AC9** A CSV row with a bad field (for example `availableQuantity` `"1.5"`) given `lineNumber` N returns errors whose `line` is N. [AGENT "Definition of Done" "Line numbers"; SAM "sets line on every error"]
- **AC10** No function throws for the inputs in R5. Each returns a failure result. [SAM "no throws"; AGENT "Conventions"]

## 10. Decisions

Sam's decisions, relayed in this run. Settled items are fixed. Flagged items are open until Sam answers.

- **Q1 countryCode vs ISO. Resolved (change request from Sam, 2026-11-06).** `countryCode` is an ISO 3166-1 alpha-2 code. Source: TH section 3, line 86 ("`countryCode` is a two-letter ISO 3166-1 alpha-2 code"). The assignment is the source of truth. It overrides the AGENT "What to do" wording "two uppercase letters" and the earlier `/^[A-Z]{2}$/` rule. Updated: R18, R29, AC5, E06, R-07. AGENT.md is not edited here; it still says "two uppercase letters". Sam raises that with the user.
- **Q14 ISO list scope. Resolved (Sam's decision, 2026-11-06).** `countryCode` passes only if it is in the official ISO 3166-1 alpha-2 list of assigned codes. Exceptionally reserved codes such as `UK` or `EU` are rejected. Unassigned `XX` and `ZZ` fail (R18, E06, R-07). Source for the code format: TH section 3, line 86. The list is named by Sam's decision, not by the assignment, which does not name the edition.
- **Q2 Success values. Settled.** `validateCsvHeader` value is `null`. `validateCsvRow` value is `{ sellerId, productId, sizeId, countryCode, availableQuantity, sourceVersion }`, with string cells as given and number cells from `Number(cell)`. The event function (`validateSellerInventoryChanged`) value is the event object as given.
- **Q3 Value content. Settled.** String fields keep the original string, no trim. Number cells become `Number(cell)`, so `"007"` gives `7`.
- **Q4 Extra properties. Settled.** Ignored. An extra key is valid (R22, E18).
- **Q5 occurredAt. Settled.** Must be a full date-time with a time part and a zone designator (`Z`, `+hh:mm` or `-hh:mm`). Fractional seconds allowed. Date-only rejected. Calendar-impossible dates such as `2026-02-30` rejected. Implementer chooses the check; E15 and E16 assert it (R17).
- **Q6 Non-string string fields. Settled.** A non-string `eventId`, `sellerId`, `productId` or `sizeId` fails on that field (R14, E13).
- **Q7 Wrong cell count. Settled.** Only the `row` count error is returned. No per-field checks run (R27, R-10).
- **Q8 Line and input types. Settled.** (a) `lineNumber` is trusted. `validateCsvRow` does not check it (R34, R-14). (b) An array passed as an event fails on `event` (R13, E21). (c) Non-array `cells` fails on `row` (R27, R-12).
- **Q9 CRLF. Settled. Hand-off to Wave 3.** The Wave 3 CSV reader strips the line ending before calling `validateCsvHeader` or `validateCsvRow`. Not in this wave (R24, section 2).
- **Q10 BOM. Settled. Hand-off to Wave 3.** No BOM handling in this wave.
- **Q11 Header errors. Settled.** Any header mismatch gives one error, `field: "header"`, `line: 1` (R25, H02 to H06).
- **Q12 Source. Settled.** The `.md` take-home is the authoritative copy. The PDFs were not read and are not cited (section 1).
- **Q13 Fixture test. Settled, deferred to Wave 3.** No CSVF fixture test in this wave (R-16).

## 11. Expected tests

All tests are unit tests in `test/validation.test.ts`. The functions are pure, so no component test is needed in this wave (SAM "Expected tests").

Run: `npm run typecheck` and `npm test -- validation` (AGENT "Verification"). Also check that Wave 1 tests still pass (AGENT "Checklist").

Status column: **settled** means the expected result is final (SAM, sources, or a Decision in section 10). **flagged Qn** means the row stays as written until Sam answers. **deferred Qn** means no Wave 2 test.

### Event: validateSellerInventoryChanged

| ID | Input | Expected | Covers | Status |
|---|---|---|---|---|
| E01 | SAMPLE event (all ten fields as in the file) | `ok: true`, value is the event object as given (Q2) | AC2, R12–R20 | settled |
| E02 | SAMPLE with one required field removed (repeat for each of the ten) | `ok: false`, error `field` = removed name, non-empty `reason` | AC4, R12 | settled |
| E03 | SAMPLE with `eventType` `"sellerinventorychanged"` or `"OtherEvent"` | fails on `eventType` | AC3, R15 | settled |
| E04 | SAMPLE with `schemaVersion` `2`, `0`, `"1"`, `1.5` | fails on `schemaVersion` | AC3, R16 | settled |
| E05 | SAMPLE with `countryCode` `"pt"`, `"P"`, `"PTT"`, `"P1"`, `"PT "`, `""` | fails on `countryCode` | AC5, R18 | settled |
| E06 | SAMPLE with `countryCode` `"XX"` or `"ZZ"` | fails on `countryCode` (unassigned in ISO 3166-1) | R18, Q1 | settled |
| E07 | SAMPLE with `availableQuantity` `-1`, `1.5`, `"3"`, `NaN`, `Infinity`, `2**53` | fails on `availableQuantity` | AC6, R19 | settled |
| E08 | SAMPLE with `availableQuantity` `0` and `2**53 - 1` | `ok: true` | R19 | settled |
| E09 | SAMPLE with `sourceVersion` `-1`, `1.5`, `"7"`, `NaN` | fails on `sourceVersion` | R20 | settled |
| E10 | SAMPLE with `sourceVersion` `0` | `ok: true` | R20 | settled |
| E11 | SAMPLE with `eventId`, `sellerId`, `productId`, `sizeId` set to `""`, `"   "`, `"\t"` (one at a time) | fails on that field | R14 | settled |
| E12 | SAMPLE with `sellerId` `" boutique-42 "` | `ok: true`; value keeps the untrimmed string (Q3) | R14 | settled |
| E13 | SAMPLE with `eventId`, `sellerId`, `productId` or `sizeId` set to `5` or `null` (one at a time) | fails on that field | R14, Q6 | settled |
| E14 | SAMPLE with `occurredAt` `"not-a-date"` | fails on `occurredAt` | R17 | settled |
| E15 | SAMPLE with `occurredAt` `"2026-10-20T08:00:00Z"`, `"2026-10-20T08:00:00.123Z"`, `"2026-10-20T08:00:00+01:00"`, `"2026-10-20T08:00:00-05:00"` | `ok: true` | R17 | settled |
| E16 | SAMPLE with `occurredAt` `"2026-10-20"`, `"2026-02-30T00:00:00Z"`, or `"2026-10-20T08:00:00"` (no zone), one at a time | each fails on `occurredAt` | R17 | settled |
| E17 | SAMPLE with `countryCode` `"pt"`, `availableQuantity` `-1`, `sourceVersion` `1.5` | three errors, fields `countryCode`, `availableQuantity`, `sourceVersion` | AC7, R9 | settled |
| E18 | SAMPLE with `extra: 1` added | `ok: true` | R22 | settled |
| E19 | Fault values: `eventId` `"fault-429"`, `productId` `"style-90001"`, `sellerId` `"seller-429"` (in a valid event) | `ok: true` | R21 | settled |
| E20 | `null`, `undefined`, `"text"`, `42`, `true` | `ok: false`, one error `field: "event"`, no throw | R13, R5 | settled |
| E21 | `[]` (array) | one error `field: "event"` | R13, Q8b | settled |
| E22 | Errors have no `line` key | `line` absent on every event error | R11 | settled |

### Header: validateCsvHeader

| ID | Input | Expected | Covers | Status |
|---|---|---|---|---|
| H01 | `sellerId,productId,sizeId,countryCode,availableQuantity,sourceVersion` (CSVF header, split into six cells) | `ok: true`, value `null` (Q2) | R23 | settled |
| H02 | Two columns swapped (`productId` before `sellerId`) | `ok: false`, `field: "header"`, `line: 1` | AC8, R25 | settled |
| H03 | Five columns (one missing) | `field: "header"`, `line: 1` | R25 | settled |
| H04 | Seven columns (one extra) | `field: "header"`, `line: 1` | R25 | settled |
| H05 | `" sellerId"`, `"sellerid"`, `"sourceVersion\r"` in place of the matching name | `field: "header"`, `line: 1` | R24 | settled |
| H06 | `[]` | `field: "header"`, `line: 1` | R25 | settled |

### Row: validateCsvRow

| ID | Input (`cells`, `lineNumber`) | Expected | Covers | Status |
|---|---|---|---|---|
| R-01 | `["seller-001","style-1","size-34","PT","0","1"]`, `2` | `ok: true`, value per Q2 (string cells as given, number cells via `Number(cell)`) | R27–R30 | settled |
| R-02 | `["seller-001","style-1","size-34","PT","0","1"]`, `10001` | `ok: true` (line number does not affect validity) | R35 | settled |
| R-03 | `availableQuantity` `"007"` | `ok: true`, `availableQuantity` value `7` (Q3) | R30 | settled |
| R-04 | `availableQuantity` `"-1"`, `"1.5"`, `"1e3"`, `" 3"`, `"3 "`, `"+3"`, `""`, `"abc"`, `"9007199254740992"` | fails on `availableQuantity`, `line` = argument | AC9, R30 | settled |
| R-05 | `availableQuantity` `"0"`, `"9007199254740991"` | `ok: true` | R30 | settled |
| R-06 | Same bad values as R-04 in `sourceVersion` | fails on `sourceVersion`, `line` = argument | R30 | settled |
| R-07 | `countryCode` `"pt"`, `"PTT"`, `""`, `" PT"`, `"XX"`, `"ZZ"` | fails on `countryCode`, `line` = argument | R29 | settled |
| R-08 | `sellerId` `""`, `"  "`; same for `productId`, `sizeId` | fails on that field, `line` = argument | R28 | settled |
| R-09 | `countryCode` `"pt"` and `availableQuantity` `"-1"` in one row | two errors, both `line` = argument | R9, R31 | settled |
| R-10 | Five cells, and seven cells | `ok: false`, one error `field: "row"`, `line` = argument (Q7) | R27 | settled |
| R-11 | Zero cells `[]` | `field: "row"`, `line` = argument | R27 | settled |
| R-12 | `cells` = `null` | `ok: false`, one error `field: "row"`, `line` = argument, no throw (Q8c) | R5, R27 | settled |
| R-13 | Bad row with `lineNumber` `2` and with `lineNumber` `10001` | every error `line` equals the argument | AC9, R31, R35 | settled |
| R-14 | Bad row (e.g. `countryCode` `"pt"`) with `lineNumber` `1`, `0`, `1.5` | errors have `line` equal to the argument as given; no error on `lineNumber` (Q8a) | R33, R34 | settled |
| R-15 | `cells` `["seller-429","style-90001","size-38","PT","3","7"]` | `ok: true` | R21 | settled |
| R-16 | Every data row of CSVF | No Wave 2 test. Deferred to Wave 3 (Q13) | — | deferred Q13 |

## 12. Choices recorded

These are choices the wording of SAM left open. They follow SAM's rules. Sam can overrule them.

- **C1** Non-object event (R13) and `undefined` event: field `event`. No `line`.
- **C2** Wrong cell count and non-array `cells` (R27): field `row`, `line` = argument.
- **C3** Header mismatch of any kind (R25): one error, field `header`, `line: 1`.
- **C4** Error reasons are free text, non-empty. Tests do not compare reason text.
- **C5** Error order is not specified (R10). Tests do not depend on order.

## retry-policy

**Task id:** retry-policy. **Wave:** 02 Building blocks. **Owner:** Poppy (PO). **Date:** 2026-11-06. **Status:** PASS (Tom, `qa.md`, "Step 5 re-run after F5 fix", 2026-11-06). The review-fix tests are recorded under Expected tests as a Sam-accepted deviation. Sam's decisions 1-11 and F3 are the contract and are marked "Sam decision". Sam's decisions OQ-1 to OQ-12 (2026-11-06) are recorded here and marked "SAM OQ-n". OQ-1 to OQ-12 are closed. The user may override items 4, 8 and 9.

**Goal:** one generic retry helper that runs an async operation, retries transient failures with exponential backoff and full jitter, honours Retry-After on 429, stops at the first terminal error and returns the outcome as a result object, never a throw. Wave 3 uses it in both HTTP clients without change. Sources: AGENT line 59; AGENT line 34 ("Wave 3 uses the retry helper in both HTTP clients"); AGENT line 83.

### Sources

| Tag | Source |
|---|---|
| AGENT | `plan/wave-02-building-blocks/AGENT.md`. "retry-policy" task, lines 57-64. Mission line 8. Fixed decisions line 26. Hand-off line 34. Conventions lines 76-83. Definition of Done lines 91-115. Risks line 131. |
| TH | `Take-Home Exercise_ Size-Level Availability Processor.md`, section 5 "Dependency failures, retries, and flow control" (lines 255-265). Line 259: Product Context lookup can return 404, 429 with Retry-After, or 503. |
| ME | `MOCK-ENVIRONMENT.md`, "Reference: deterministic fault inputs" (lines 120-131). 429 with `Retry-After: 5` at lines 126, 128, 130. 503 at lines 127, 129, 131. |
| CFG | `src/config.ts`. `retryMaxAttempts` default 5, `retryBaseMs` default 200, `retryMaxMs` default 5000. |
| SAM n | Sam decision n for this task (items 1-11), relayed in this run. |
| SAM OQ-n | Sam decision OQ-1 to OQ-12 for this task, relayed in this run (2026-11-06). |
| SAM F3 | Sam decision F3 (timer clamp) for this task, relayed in this run (2026-11-06). Applied in the Contract, R-retry-04 and Expected tests. |

**PDFs not read.** `plan/OVERVIEW.pdf` and `Take-Home Exercise_ Size-Level Availability Processor.pdf` return binary PDF data from the view tool, with no readable text. Re-checked in step 2: both still return binary PDF data (`%PDF-1.4`). Nothing in this section cites them. The `.md` take-home is used, as in Q12 above.

### Contract

Signature (SAM 2; Tom's assumption accepted):

```ts
export type RetryResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export function withRetry<T>(
  operation: () => Promise<T>,                     // called with no arguments (SAM OQ-7)
  config: Config,                                  // Config from src/config.ts
  deps: { sleep: (ms: number) => Promise<void> },  // injected; ms is milliseconds, at most 2147483647 (SAM F3)
): Promise<RetryResult<T>>;
```

**Sleep delay limit (Sam decision F3).** The delay passed to `deps.sleep` is clamped to 2147483647 ms, the Node timer limit. Both the jittered delay and the Retry-After floor are clamped to this value, so every `ms` the helper passes is at most 2147483647. A valid Retry-After floor is already at most 2147483000 ms (R-retry-14, SAM OQ-11), so the clamp changes only the jittered delay, and only when `RETRY_MAX_MS` is above 2147483647. A Retry-After above the limit is still ignored, not clamped (SAM OQ-11, EC-retry-10). Source: Sam decision F3.

**Error contract for Wave 3 (SAM 3).** The Wave 3 HTTP clients must produce errors that carry these fields. The helper reads no other fields. This wave does not build the clients.

| Field | Type | Produced by | Meaning |
|---|---|---|---|
| `status` | number | HTTP client, for each HTTP error response | HTTP status code of the response. When present, it decides the classification (SAM OQ-4, OQ-8). |
| `retryAfter` | string | HTTP client, on 429 when the Retry-After header is present | Retry-After header value. Valid only as ASCII digits after `trim()` (String.prototype.trim(), SAM OQ-10), and only if the value × 1000 is no greater than 2147483647 (SAM OQ-11). Other values are ignored by the helper (SAM OQ-1, OQ-9, OQ-11). |
| `cause.code` | string | Network error (e.g. `TypeError` "fetch failed" with the code in `cause`) | Node network error code |
| `name` | string | Timeout | `TimeoutError` only. `AbortError` is not a timeout signal (SAM OQ-2). |

### Requirements

- **R-retry-01 Files.** Helper in `src/infra/retry.ts`. Tests in `test/retry.test.ts`. Source: AGENT line 60.
- **R-retry-02 Signature.** `withRetry(operation, config, { sleep })` is exported from `src/infra/retry.ts`, with the signature in the Contract. The helper calls `operation` with no arguments (SAM OQ-7). Source: SAM 2; SAM OQ-7; AGENT line 59 (values come from config).
- **R-retry-03 Config only through the argument.** The helper reads `retryMaxAttempts`, `retryBaseMs` and `retryMaxMs` from the `config` argument. It reads no environment variable. Source: SAM 2; AGENT line 80 ("Read configuration only through `src/config.ts`").
- **R-retry-04 Injected sleep.** Every wait goes through `deps.sleep(ms)`, with `ms` in milliseconds. The helper does not use real timers. Source: AGENT line 59 ("Make the sleep function injectable"); SAM 2 (`{ sleep }`; ms unit from Tom's assumption, accepted); AGENT line 131 ("Test it with an injected clock, not real sleeps"). Sam decision F3: each `ms` passed to `deps.sleep` is at most 2147483647. The jittered delay and the Retry-After floor are both clamped to that value (see Contract, "Sleep delay limit"). Source: Sam decision F3; `qa.md` test row for F3 (line 154).
- **R-retry-05 Success.** The first call that resolves returns `{ ok: true, value }` with that call's value. Source: SAM 2.
- **R-retry-06 Failure is a result.** When the helper stops with an error, it resolves `{ ok: false, error }`. It does not reject for an error from the operation. Source: SAM 2; AGENT line 64 ("returned as a failure result, not thrown").
- **R-retry-07 Attempt limit.** `RETRY_MAX_ATTEMPTS` is the total number of calls, including the first. With the default 5 there are at most 5 calls and 4 waits. Source: SAM 7; CFG; AGENT line 26.
- **R-retry-08 Retryable.** Classification, in this order (SAM OQ-4). 1. If the error has a numeric `status`, the status decides: retryable if it is 429 or 503, terminal otherwise. `cause.code` and `name` are not checked (SAM OQ-8). 2. If the error has no numeric `status`, it is retryable if (a) `cause.code` is one of ECONNRESET, ECONNREFUSED, ETIMEDOUT, EAI_AGAIN, EPIPE, or (b) `name` is TimeoutError. The list in 2(a) is the full set of retryable network codes (SAM OQ-5). `name` AbortError is not a timeout and is not retryable (SAM OQ-2). Rule 2 applies to timeouts too, under the no-status rule of SAM OQ-4 (SAM OQ-8). Source: AGENT line 59 (429, 503, network errors, timeouts); SAM 3, 4, 5; SAM OQ-2, OQ-4, OQ-5, OQ-8; TH line 259; ME lines 126-131.
- **R-retry-09 Terminal.** An error that is not retryable (R-retry-08) is terminal. This covers status 404, 408, 500, 502 and 504; every other 4xx and 5xx (any numeric status except 429 and 503, even when the error also carries a network code or timeout name; SAM OQ-4, OQ-8); `name` AbortError (SAM OQ-2); ENOTFOUND, ECONNABORTED and any other network code outside the five in R-retry-08 (SAM OQ-5); and any error with no transient marker (domain rejection). Source: AGENT line 59 (404, other 4xx, domain rejections); SAM 4, 6; SAM OQ-2, OQ-4, OQ-5, OQ-8. AGENT does not name 408, 500, 502 or 504 by itself; they follow SAM 4 as a conservative default. User review needed (SAM 4 may be overridden).
- **R-retry-10 Terminal not retried.** On a terminal error the operation is not called again. The helper resolves `{ ok: false, error }` with that error at once. Source: AGENT line 63 ("Terminal errors are never retried"); AGENT line 104 ("404 and domain rejections are called exactly once"); SAM 6. Returning the terminal error itself is confirmed (SAM OQ-6).
- **R-retry-11 Last error after the limit.** When the last allowed call fails with a retryable error, the helper resolves `{ ok: false, error: lastError }`. Source: SAM 7; AGENT lines 64 and 105.
- **R-retry-12 Backoff ceiling.** For retry n (1-based; retry 1 is the wait before call 2), `ceiling(n) = min(RETRY_MAX_MS, RETRY_BASE_MS × 2^(n-1))`. The first retry ceiling is `RETRY_BASE_MS`. Source: SAM 8; AGENT line 26 (exponential backoff; defaults are engineering choices).
- **R-retry-13 Full jitter.** The jittered wait for retry n is a random number of ms in the closed interval [0, ceiling(n)]. Source: SAM 8; AGENT lines 26 and 59 ("full jitter").
- **R-retry-14 Retry-After on 429.** When a 429 error carries a valid `retryAfter` (SAM OQ-1), the floor is `retryAfter × 1000` ms. The wait before the next retry is at least the floor. A valid value is, after `trim()` (String.prototype.trim(), SAM OQ-10) is applied, ASCII digits only (matches `/^\d+$/`, SAM OQ-9), and its ms form, `retryAfter` × 1000, is no greater than 2147483647 (SAM OQ-11). trim() removes the characters ECMAScript defines as white space or line terminators at either end, so tabs, line breaks and non-breaking spaces are removed as well as spaces. The largest valid integer is therefore 2147483 (floor 2147483000 ms). Leading zeros are valid: "05" is 5. Valid examples: "0", "5", "05", " 5". Ignored examples: "+5", "5.0", "1.5", "-1", "", "abc", an HTTP-date, "2147484" (ms form 2147484000, above the limit; SAM OQ-11), and any value above Number.MAX_SAFE_INTEGER (SAM OQ-9; already above the timer limit). An ignored value gives no floor: the wait is the jittered wait only (R-retry-13). Source: SAM 3, 9; SAM OQ-1, OQ-9, OQ-10, OQ-11; AGENT line 59 ("For 429 honour the Retry-After header in seconds and wait at least that long"); TH line 259; ME lines 126, 128, 130 (`Retry-After: 5`).
- **R-retry-15 Floor not capped.** The floor is not limited by `RETRY_MAX_MS`. Final wait = max(jittered wait, floor). Source: SAM 9. AGENT is silent on a cap (see Q-R9 below).
- **R-retry-16 No floor otherwise.** A 429 without a valid `retryAfter` (R-retry-14), and every other error, has floor 0. Its wait is the jittered wait only. Source: SAM 9 (rule is "on 429"); SAM 10 (503 ignored). The no-header case is derived.
- **R-retry-17 Retry-After ignored on 503.** `retryAfter` on a 503 has no effect on the wait. Source: SAM 10; AGENT line 59 ("For 429").
- **R-retry-18 Waits only between attempts.** A wait happens only before a retry. There is no wait after a success, after a terminal stop or after the last allowed call. Source: derived from SAM 7 and 8. Matches Tom's assumed tests.
- **R-retry-19 Error fields.** The helper classifies only by the fields in the Error contract table. An error with none of them is a domain rejection (R-retry-09). Source: SAM 3, 6; AGENT line 34.
- **R-retry-20 Transient marker.** In SAM 6, "transient marker" means one of the R-retry-08 signals: status 429 or 503, a listed `cause.code`, or a timeout `name` (TimeoutError only), applied with the precedence in R-retry-08. No other marker is defined in this wave. Confirmed by Sam (SAM OQ-3).
- **R-retry-21 Pure.** No network, database or file access. The only effect is the injected sleep. Source: AGENT line 8 ("pure logic or storage with no network calls"); AGENT line 59.
- **R-retry-22 Defaults are engineering choices.** `RETRY_MAX_ATTEMPTS=5`, `RETRY_BASE_MS=200` and `RETRY_MAX_MS=5000` come from `src/config.ts`. They are not assignment values. Their justification is written in `docs/decisions.md` by Dan. Source: AGENT lines 26, 59 and 113; SAM 11.
- **R-retry-23 docs/ folder.** The `docs/` folder is created in this wave for `docs/decisions.md` only. Source: SAM 11; AGENT line 28 (names `docs/decisions.md`). Note: AGENT line 60 (Files) does not list `docs/decisions.md`. The Definition of Done (AGENT line 113) does. SAM 11 settles it.

### Acceptance criteria

- **AC-retry-01 Retry-After 5.** A 429 with `retryAfter` "5" on call 1, then success on call 2: exactly one wait, and it is at least 5000 ms, checked with the injected sleep. With default config the wait is exactly 5000 ms, because the jitter ceiling (200 ms) is below the floor. Refs R-retry-14. Source: AGENT line 62; AGENT line 103.
- **AC-retry-02 Terminal never retried.** For each of these errors: status 400, 404, 408, 409, 422, 500, 501, 502, 504, 505; `name` AbortError; `cause.code` ENOTFOUND or ECONNABORTED; and a domain rejection (no marker): the operation is called exactly once, there is no wait, and the result is `{ ok: false, error }` with that same error. Refs R-retry-08, R-retry-09, R-retry-10. Source: AGENT lines 63, 104; SAM 4, 6; SAM OQ-2, OQ-5.
- **AC-retry-03 Retryable then success.** For status 429, status 503, each of ECONNRESET, ECONNREFUSED, ETIMEDOUT, EAI_AGAIN, EPIPE (no status), and `name` TimeoutError (no status): the operation is retried, and a later success returns `{ ok: true, value }` with that value. Refs R-retry-08, R-retry-05. Source: AGENT line 59; SAM 3, 4, 5; SAM OQ-2, OQ-4.
- **AC-retry-04 Limit reached.** When every call fails with a retryable error, the operation is called exactly RETRY_MAX_ATTEMPTS times, there are RETRY_MAX_ATTEMPTS − 1 waits, the result is `{ ok: false, error: <last error> }`, and nothing is thrown. Refs R-retry-07, R-retry-11. Source: AGENT lines 64 and 105; SAM 7.
- **AC-retry-05 One attempt.** With RETRY_MAX_ATTEMPTS = 1, a retryable error gives one call, no wait and `{ ok: false, error }`. Source: SAM 7.
- **AC-retry-06 Backoff bounds.** For every retry n where no Retry-After applies, each wait w satisfies 0 ≤ w ≤ min(RETRY_MAX_MS, RETRY_BASE_MS × 2^(n-1)). The first retry wait is at most RETRY_BASE_MS. Checked over repeated runs. Refs R-retry-12, R-retry-13. Source: SAM 8.
- **AC-retry-07 Ceiling capped.** With RETRY_MAX_ATTEMPTS = 10 and RETRY_MAX_MS = 1000, no jittered wait exceeds 1000 ms. Refs R-retry-12. Source: SAM 8; CFG.
- **AC-retry-08 Floor not capped.** A 429 with `retryAfter` "10" and RETRY_MAX_MS = 5000: the wait is at least 10000 ms. Refs R-retry-15. Source: SAM 9.
- **AC-retry-09 503 ignores Retry-After.** A 503 with `retryAfter` "5": the first retry wait is at most RETRY_BASE_MS, not 5000 ms. Refs R-retry-17. Source: SAM 10.
- **AC-retry-10 429 without Retry-After.** A 429 with no `retryAfter` has a wait within its ceiling only. Refs R-retry-16.
- **AC-retry-11 First call succeeds.** One call, no wait, `{ ok: true, value }`. Refs R-retry-05, R-retry-18.
- **AC-retry-12 Config argument only.** Changing RETRY_* environment variables does not change the helper's behaviour. Only the `config` argument counts. Refs R-retry-03.
- **AC-retry-13 No real waiting.** All tests use the injected sleep. No test waits in real time. Refs R-retry-04. Source: AGENT line 131.
- **AC-retry-14 Non-Error rejection.** An operation that rejects with a string, `null` or `undefined` is terminal. The helper resolves `{ ok: false, error }` and does not throw. Refs R-retry-09, R-retry-06. Derived from SAM 6.
- **AC-retry-15 Retry-After format.** A 429 with `retryAfter` "0" has floor 0: no extra wait. "5" has floor 5000 ms, as AC-retry-01. "05" and " 5" each have floor 5000 ms, after `trim()` is applied (SAM OQ-10). A 429 with `retryAfter` set to an HTTP-date, "abc", "", "-1", "1.5", "+5", "5.0", "9007199254740992", "9007199254740991" or "2147484" has no floor: the first retry wait is at most RETRY_BASE_MS, and no Retry-After value raises it. "2147484" is 2147484000 ms, above the timer limit of 2147483647 ms, so it is ignored (SAM OQ-11). "9007199254740991" is ignored for the same reason (SAM OQ-11). Refs R-retry-14, R-retry-16, EC-retry-10. Source: SAM OQ-1, OQ-9, OQ-10, OQ-11.
- **AC-retry-16 Status precedence.** When an error has a numeric status, the status decides (SAM OQ-4). (a) Status 404 with `cause.code` ECONNRESET: terminal, one call, no wait, `{ ok: false, error }` with that error. (b) Status 503 with `cause.code` ENOTFOUND: retryable, and a later success returns `{ ok: true, value }`. (c) Status 404 with `name` TimeoutError: terminal, one call, no wait (SAM OQ-8). Refs R-retry-08, R-retry-09. Source: SAM OQ-4, OQ-8.
- **AC-retry-17 No arguments.** Every call of `operation`, first call and retries alike, receives zero arguments. Refs R-retry-02. Source: SAM OQ-7.

### Edge cases

- **EC-retry-01 Retry-After "0".** Floor 0. The wait is the jittered wait only. Derived from R-retry-14 and R-retry-16.
- **EC-retry-02 Retry-After not a valid value** (HTTP-date form, "abc", "", "-1", "1.5"). Ignored: no floor, jittered wait only (SAM OQ-1). Covered by AC-retry-15. The full form rule is SAM OQ-9 (R-retry-14, AC-retry-15): "05" and " 5" are valid; "+5" and "5.0" are ignored. The timer-limit rule is SAM OQ-11 (EC-retry-10).
- **EC-retry-03 Network code outside the list** (ENOTFOUND, ECONNABORTED, other codes). Terminal. Covered by AC-retry-02. Source: SAM 5 ("the list in item 4 is the full set"); SAM OQ-5.
- **EC-retry-04 404 after a 503.** Stop at the 404. Two calls, one wait, no wait after the 404, and the result is `{ ok: false, error: <404 error> }`. Source: AGENT line 63; SAM 4; SAM OQ-6.
- **EC-retry-05 AbortError from a deliberate cancel.** Terminal: one call, no wait, `{ ok: false, error }` (SAM OQ-2). Covered by AC-retry-02.
- **EC-retry-06 Two markers on one error** (e.g. status 404 with `cause.code` ECONNRESET). Status decides: terminal (SAM OQ-4). The same holds for a 404 with `name` TimeoutError (SAM OQ-8). Covered by AC-retry-16.
- **EC-retry-07 RETRY_BASE_MS above RETRY_MAX_MS.** The first retry ceiling is RETRY_MAX_MS. Derived from R-retry-12.
- **EC-retry-08 High retry count.** Once `RETRY_BASE_MS × 2^(n-1)` exceeds RETRY_MAX_MS, the ceiling stays at RETRY_MAX_MS. Derived from R-retry-12.
- **EC-retry-09 Default numbers (for the docs).** Ceilings for retries 1 to 4 are 200, 400, 800 and 1600 ms. RETRY_MAX_MS (5000) is not reached within 5 calls. Only the Retry-After floor can exceed 1600 ms in the default run. Derived from SAM 7, 8 and CFG. Input for Dan's justification (R-retry-22).

- **EC-retry-10 Retry-After above the timer limit** (e.g. "2147484"). Its ms form, `retryAfter` × 1000, is above 2147483647. Node setTimeout fires immediately above that value. The value is ignored, the same as an invalid format: no floor, and the jittered wait only. No floor is applied, and the value is not clamped to the limit. Covered by AC-retry-15 and the expected test below. Source: SAM OQ-11.

### Expected tests

- **Level:** unit only, in `test/retry.test.ts`. Use a fake sleep that records each wait. No network, no real delay. Source: AGENT lines 60, 62-64, 131. Real HTTP faults (ME lines 126-131) are for Wave 3 client tests, not this wave.
- **Tom's plan in `work/wave-02/qa.md` (lines 128-144): accepted.** Map to ACs: retryable rows to AC-retry-03; terminal rows to AC-retry-02; the 404-after-503 test to EC-retry-04; Retry-After test to AC-retry-01; max-attempts tests to AC-retry-04 and AC-retry-05; the sleep-unit test to R-retry-04; the no-wait-after-last-call and no-wait-on-success tests to R-retry-18; the jitter tests to AC-retry-06 and AC-retry-07.
- **Additions Tom must cover:**
  - ECONNREFUSED, ETIMEDOUT, EAI_AGAIN and EPIPE each retryable (Tom's plan has ECONNRESET only). AC-retry-03.
  - `name` AbortError terminal: one call, no wait, returned as failure. AC-retry-02 (SAM OQ-2).
  - Status 408, 500, 502, 504 and 501 each terminal. AC-retry-02.
  - Domain rejection with no marker, one call, returned as failure. AC-retry-02.
  - A non-Error rejection (string, null or undefined) is terminal and not thrown. AC-retry-14.
  - Retry-After "10" with RETRY_MAX_MS 5000 gives at least 10000 ms. AC-retry-08.
  - Retry-After on 503 does not change the wait. AC-retry-09.
  - A 429 with no Retry-After has no floor. AC-retry-10.
  - Retry-After "0" gives no extra wait. "05" and " 5" give a floor of 5000 ms. HTTP-date, "abc", "", "-1", "1.5", "+5", "5.0", "9007199254740992" and "9007199254740991" are ignored with no floor ("9007199254740991" per SAM OQ-11). AC-retry-15 (SAM OQ-1, OQ-9, OQ-11).
  - Retry-After "2147484" (2147484000 ms, above the timer limit) is ignored: no floor, the jittered wait only. EC-retry-10, AC-retry-15 (SAM OQ-11). This is the one expected test added for OQ-11.
  - Status precedence: 404 with ECONNRESET is terminal; 503 with ENOTFOUND is retryable; 404 with TimeoutError is terminal (SAM OQ-8). AC-retry-16 (SAM OQ-4, OQ-8).
  - `operation` receives zero arguments on every call. AC-retry-17 (SAM OQ-7).
  - ENOTFOUND and ECONNABORTED (outside the list) are terminal. AC-retry-02, EC-retry-03.
  - Changing env vars does not change behaviour. AC-retry-12.
  - First retry wait is at most RETRY_BASE_MS. AC-retry-06.
  - Timer clamp (Sam decision F3, R-retry-04): with `RETRY_MAX_ATTEMPTS=26` and `RETRY_MAX_MS=3000000000`, and the jitter forced to the top of its interval, there are 25 waits and every `ms` passed to sleep is at most 2147483647.
- **Review-fix tests and Sam-accepted deviation.** These tests were added after `src/infra/retry.ts` existed, as review fixes from Tom's Step 5 reviews (`qa.md`: FAIL, FAIL on F5, then PASS). The tests-first order was not followed for them. Sam accepts this as a deviation (same handling as the input-validation C3 note in `status.md`, retry-policy task end, R3).
  - Retry-After limit test (SAM OQ-11, AC-retry-15, EC-retry-10): `"2147484"` is ignored, no floor, the jittered wait only. Added after the code.
  - Env-ignore test (F2 and F5, AC-retry-12): all three `RETRY_*` variables are stubbed, and the first wait stays within `config.retryBaseMs`. F2 was closed by the F5 fix (`qa.md`, "Step 5 re-run after F5 fix"). Added after the code.
  - RETRY_BASE_MS above RETRY_MAX_MS test (F1, EC-retry-07): the first retry wait is at most RETRY_MAX_MS. Added after the code.
  - F3 clamp test (Sam decision F3, R-retry-04): Sam reports this test was red before the clamp fix and green after it. The `qa.md` F3 row (line 154) does not record that red run.
  - Red status: the F1, F2 and F5 tests passed on the current code when they were added. `qa.md` Step 5 rounds record no red run for them, and the F5 check was reasoned from the code, not run as a mutation.

### Answers to Tom's questions (qa.md "## retry-policy", Q-R1 to Q-R11)

- **Q-R1 Missing spec.** Yes. This section is the spec. It is AGENT lines 57-64 plus SAM 1-11.
- **Q-R2 Signature.** Confirmed (SAM 2). Config is a parameter, the helper reads no env, sleep is injected in ms. R-retry-02 to R-retry-04.
- **Q-R3 Error shape.** Confirmed (SAM 3). The Error contract table is the Wave 3 contract: `status`, `retryAfter`, `cause.code` and `name`. Wave 3 clients must produce them. Not built in this wave.
- **Q-R4 Other 5xx and 408.** SAM 4: 408, 500, 502 and 504 are terminal. All other 4xx and 5xx except 429 and 503 are terminal too. 500, 502 and 504 are a conservative default. The user must review them. 408 is terminal under AGENT's "other 4xx" and SAM 4.
- **Q-R5 Network codes.** SAM 5: the five codes are the full set. Any other code is terminal (EC-retry-03, OQ-5).
- **Q-R6 Domain rejections.** SAM 6: terminal unless the error has a transient marker. Confirmed by Sam (SAM OQ-3): the marker is one of the R-retry-08 signals. No separate marker field exists in this wave.
- **Q-R7 Attempt count.** Total calls, including the first (SAM 7). Tom's assumption is confirmed.
- **Q-R8 First retry ceiling.** `ceiling(n) = min(RETRY_MAX_MS, RETRY_BASE_MS × 2^(n-1))`. The first retry ceiling is RETRY_BASE_MS (SAM 8). Tom's assumption is confirmed.
- **Q-R9 Retry-After above RETRY_MAX_MS.** Not capped (SAM 9). Retry-After "10" with RETRY_MAX_MS 5000 waits at least 10000 ms (AC-retry-08).
- **Q-R10 Retry-After on 503.** Ignored (SAM 10). AC-retry-09.
- **Q-R11 docs/decisions.md.** Required (SAM 11; AGENT line 113). Dan writes it with the retry defaults and their justification as engineering choices. The `docs/` folder is created for this file only. Not a Tom test item (R-retry-22, R-retry-23).

### Open questions for Sam (OQ-1 to OQ-12, all closed by Sam)

- **OQ-1 Retry-After values. CLOSED (Sam decision).** Valid only as a non-negative integer number of seconds. Any other value (HTTP-date, "abc", "", "-1", "1.5") is ignored: no floor is applied and the jittered delay is used. Applied in R-retry-14, R-retry-16, AC-retry-15, EC-retry-02.
- **OQ-2 AbortError. CLOSED (Sam decision).** Timeouts are `name` TimeoutError only. AbortError is terminal, because a deliberate cancel raises it. This replaces SAM 3's "TimeoutError or AbortError". Applied in R-retry-08, R-retry-09, AC-retry-02, AC-retry-03, EC-retry-05, Error contract `name` row.
- **OQ-3 Transient marker. CLOSED (Sam confirmed).** The markers are only the status, network code and timeout signals from SAM 3 and 4. Applied in R-retry-20.
- **OQ-4 Precedence. CLOSED (Sam decision).** If an error has a numeric status, the status decides: 429 and 503 are retryable, others terminal. Network codes are checked only when there is no status. Applied in R-retry-08, R-retry-09, AC-retry-16, EC-retry-06. The timeout `name` is settled by OQ-8.
- **OQ-5 Network codes. CLOSED (Sam decision).** ENOTFOUND and ECONNABORTED are terminal. The list in SAM 4 (ECONNRESET, ECONNREFUSED, ETIMEDOUT, EAI_AGAIN, EPIPE) is the full set of retryable network codes. Applied in R-retry-08, R-retry-09, AC-retry-02, EC-retry-03.
- **OQ-6 Returned error. CLOSED (Sam confirmed).** On a terminal stop the terminal error itself is returned as `error`. Applied in R-retry-10, EC-retry-04.
- **OQ-7 Operation arguments. CLOSED (Sam confirmed).** The helper calls `operation` with no arguments. Applied in the Contract, R-retry-02, AC-retry-17.
- **OQ-8 Timeout name and status precedence. CLOSED (Sam decision).** The status rule applies to all signals. If an error has a numeric status, the status decides. A TimeoutError or network code is checked only when there is no status. So a 404 with TimeoutError is terminal. Applied in R-retry-08, R-retry-09, AC-retry-16(c), EC-retry-06 and Expected tests.
- **OQ-9 Retry-After forms not listed. CLOSED (Sam decision).** After surrounding whitespace is stripped, the value must match `/^\d+$/` (ASCII digits). Leading zeros are accepted: "05" is 5. "+5", "5.0", "1.5", "-1" and "" are ignored. Values above Number.MAX_SAFE_INTEGER are ignored. Ignored means no floor, and the jittered delay is used. Applied in R-retry-14, R-retry-16, AC-retry-15, EC-retry-02 and Expected tests.
- **OQ-10 Meaning of "whitespace" (raised by PO in step 2). CLOSED (Sam decision).** "Strip surrounding whitespace" means String.prototype.trim(). Named in R-retry-14, the Contract (`retryAfter` row) and AC-retry-15. The earlier restriction that no test uses whitespace other than the space character is lifted.
- **OQ-11 Node timer limit. CLOSED (Sam decision).** Node setTimeout fires immediately above 2147483647 ms. A Retry-After whose ms form (seconds × 1000) is above 2147483647 is ignored, the same as an invalid format. No floor is applied and the jittered delay is used. This makes "9007199254740991" (OQ-9 example) ignored. Applied in R-retry-14, the Contract (`retryAfter` row), AC-retry-15, EC-retry-10 and Expected tests (one new test: "2147484").
- **OQ-12 Wording "at least". CLOSED (Sam decision).** R-retry-14 keeps "at least" the Retry-After seconds. No wording change. The exact 1000 ms assertion for Retry-After "1" is a valid test of the floor (with default config the jitter ceiling is 200 ms, so the wait is exactly 1000 ms). It is not a new expected-test entry.

### Conflicts and notes against the sources

- **N-1** AGENT line 59 says "network errors" are retryable and gives no code list. SAM 5 fixes the list to five codes. Not a contradiction. Resolved by SAM OQ-5.
- **N-2** AGENT line 59 names 429 and 503 as retryable and 404 and "other 4xx" as terminal. It does not classify 500, 502 or 504. SAM 4 makes them terminal. This needs user review.
- **N-3** AGENT line 105 ("After RETRY_MAX_ATTEMPTS the last error returns") does not say whether the count includes the first call. SAM 7 settles it: total calls.
- **N-4** `docs/decisions.md` is required by AGENT line 113 but is not in the Files list at AGENT line 60. SAM 11 settles it.
- **N-5** The sources do not cover the Retry-After format beyond "seconds" (format fixed by SAM OQ-1, OQ-9 and OQ-11; the whitespace set fixed by OQ-10), the cap on the floor (SAM 9 settles it), or AbortError (now fixed by SAM OQ-2).
- **N-6** The take-home and plan PDFs are unreadable in this environment (see Sources). Only the `.md` take-home is cited.
