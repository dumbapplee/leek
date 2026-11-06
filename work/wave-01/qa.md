## scaffold-project

**Status:** step 2 (tests first). Test plan written. Implementation not started. Verdict: PASS (review 2).

**Sources:** requirements.md (R = requirement, AC = acceptance criterion, SUP = supervisor decision for open questions).

### Test files

| File | Tests | Type |
|---|---|---|
| `test/config.test.ts` | 41 | Unit. Calls `loadConfig` with an explicit env object. |
| `test/health.test.ts` | 3 | Component. Starts the Express app from `createApp()` on an ephemeral port and calls GET /health with `fetch`. |

No new dependency. No supertest.

### Test plan

| Test | File | AC | R / SUP |
|---|---|---|---|
| returns every default when no variables are set | config | AC3 | R6 |
| uses the default for %s when it is empty (11 rows, one per variable) | config | AC6 | R6, SUP empty |
| reads COUNTRY_CODE, PRODUCT_CONTEXT_BASE_URL, AVAILABILITY_BASE_URL, DB_PATH from the env object (4 rows) | config | AC4 (string fields) | R5, R6 |
| reads PORT from the env object as a number (`"8081"` gives `8081`) | config | AC4 | R5, R7 |
| reads CONCURRENCY from the env object as a number (`"16"` gives `16`) | config | AC4 | R5, R7 |
| reads CHUNK_SIZE, RETRY_MAX_ATTEMPTS, RETRY_BASE_MS, RETRY_MAX_MS, LEASE_TTL_MS from the env object (5 rows) | config | AC4 (other numeric fields) | R5, R7 |
| throws an error naming X when it is 0 (7 rows, one per numeric variable) | config | AC5 | R7, SUP "0" |
| throws an error naming CONCURRENCY when it is "-1", "1.5", "abc", "3000abc", " 8", "8 ", "+8", "1e3" (8 rows) | config | AC5 | R7, SUP format rules |
| accepts PORT 65535 | config | AC5 (boundary) | SUP PORT max |
| throws an error naming PORT when it is 65536 | config | AC5 | SUP PORT max |
| reads leading zeros as the same number ("08" gives 8) | config | AC4 | SUP leading zeros |
| responds with status 200 | health | AC2 (part) | R8 |
| responds with the body {"status":"ok"} | health | AC2 (part) | R8, SUP body |
| responds with a JSON content type | health | AC2 (part) | R8 |

Test count: config 41, health 3, total 44.

Mapping to AC numbers:

- **AC1** (install, typecheck, build, test, five scripts): manual in phase 2. Not a Vitest test.
- **AC2** (`npm start` serves /health): component tests cover the app. The `npm start` and curl check is manual in phase 2.
- **AC3**: 1 test.
- **AC4**: 2 explicit tests (PORT, CONCURRENCY) plus the override rows.
- **AC5**: 7 + 8 + 2 tests.
- **AC6**: 11 tests (every variable in R6, which covers "any variable"). SUP asked for at least one string and one numeric. The full set is a superset.
- **AC7** (`strict: true`, ESM output in tsconfig): manual file read in phase 2.
- **AC8** (no URL, port or secret literal outside `src/config.ts`): manual review in phase 2. See open question 3.

Edge cases from requirements: `0`, `-1`, `1.5`, `abc`, `3000abc` all covered. Unset and empty covered. Health other routes: not tested (not in scope). Port in use: not tested (SUP 5).

### Test run before implementation

No red run was captured: the tests were not executed before `src/` existed, so the expected import failures were not observed.
Reason: `package.json`, `src/` and `node_modules` did not exist yet, so Vitest could not start.

### Open questions for Poppy and Sam

1. **Factory name.** requirements.md does not name the Express app factory in `src/server.ts`. The health test imports `createApp` and calls it with no arguments. Dan must export that name, or Sam decides a different one.
2. **Import suffix.** Tests import `../src/config.js` and `../src/server.js` (ESM with `.js` suffix). This works with `"module": "NodeNext"` or an ESM-compatible `moduleResolution`. Dan must use an ESM setup that resolves these paths.
3. **AC8 scope.** The health test uses the loopback address `127.0.0.1` as a literal to build its request URL. Read literally, AC8 would flag it. I read AC8 as production code only. Sam to confirm.
4. **Health content type.** The test "responds with a JSON content type" is not in requirements.md. It follows from "JSON body" in R8. Remove it if Sam does not want it.
5. **R7 text.** requirements.md R7 still says "positive integer" with no upper bound on PORT. The supervisor decision (PORT at most 65535) is not written there. Poppy to update R7.
6. **AC6 wording.** AC6 says "any variable". SUP says "at least one string and one numeric". Tests cover all 11. Poppy to confirm the intent.

**Decisions (Sam):** 1. Factory name: createApp() exported from src/server.ts. Accepted, and implemented. 2. Import suffix: .js suffix in test imports is accepted; the ESM setup resolves it. Accepted. 3. AC8 scope: production code only. Loopback literal in test files is exempt. 4. Health content-type test: keep it. 5. R7 PORT maximum 65535: decided. Poppy has updated requirements.md. 6. AC6: applies to all 11 variables. Covered.

## scaffold-project review

**Reviewer:** Tom. **Date:** 2026-11-06. **Shell note:** `npm` was run as `npm.cmd` because PowerShell blocks `npm.ps1` (execution policy). No policy was changed.

**Verdict: FAIL**

### Gate runs (observed)

| Command | Result |
|---|---|
| `npm.cmd run typecheck` (`tsc --noEmit`) | exit 0 |
| `npm.cmd run build` (`tsc`) | exit 0 |
| `npm.cmd test` (`vitest run`) | 2 files passed, **44 tests passed, 0 failed**, exit 0 |
| `npm.cmd ls --depth=0` | exit 0, tree consistent (express 5.3.0, better-sqlite3 13.0.3, vitest 5.1.0, typescript 7.0.2) |
| `node -e` load `better-sqlite3`, `:memory:` query | exit 0, SQLite 3.53.4 |
| `tsc --ignoreConfig --noEmit --strict` on `test/config.test.ts` and `test/health.test.ts` | exit 0 |

`npm install` was not re-run. The install tree and native module were checked instead.

### Manual tests (observed)

| Step | Command | Observed |
|---|---|---|
| Default port | `npm.cmd start` (background), `curl.exe -i http://127.0.0.1:3000/health` | HTTP 200, `Content-Type: application/json`, body `{"status":"ok"}`. Server stopped. |
| PORT=4100 | `$env:PORT='4100'; npm.cmd start` (background), `curl.exe -i http://127.0.0.1:4100/health` | HTTP 200, body `{"status":"ok"}`. `curl` to 3000 exit 7 (refused). Only a `::` listener on 4100 was present. Server stopped. |
| CONCURRENCY=abc | `$env:CONCURRENCY='abc'; npm.cmd start` | Exit 1. stderr: `Error: CONCURRENCY must be a positive integer, got "abc"` from `dist/config.js`. No listener left on 3000 or 4100. |

### Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1 | Pass (install not re-run) | Typecheck, build and test exit 0. Five scripts present in `package.json` lines 6-11. |
| AC2 | Pass | Manual curl above. Component test `test/health.test.ts`. |
| AC3 | Pass | `loadConfig({})` equals all R6 defaults (test `returns every default when no variables are set`). |
| AC4 | Pass | PORT and CONCURRENCY parsed to numbers in tests. |
| AC5 | Pass | 7 zero rows, 8 malformed CONCURRENCY rows, PORT 65535 accepted, PORT 65536 rejected. All in the 44 passing. |
| AC6 | Pass | 11 empty-string rows, one per R6 variable, all return the default. |
| AC7 | Pass | `tsconfig.json` line 6 `"strict": true`. `"module": "NodeNext"` with `"type": "module"` in `package.json` line 5. `dist/main.js` runs as ESM. |
| AC8 | Pass | Grep of `src/`: URL, port and default literals appear only in `src/config.ts` lines 42-51. No `any`, comments or TODOs in `src/`. `127.0.0.1` in test files is exempt (supervisor decision). |

R6 defaults and R7 rules were checked against `src/config.ts` lines 42-51. The PORT maximum of 65535 is at line 42. The empty-means-default rule is the `!raw` check at line 27. Numeric parsing is `/^\d+$/` at line 32.

### Protected files

- `wiremock/` (18 files: 4 in `__files/`, 14 in `mappings/`) and `compose.yaml`: `git status --short --ignored` shows no changes.
- `MOCK-ENVIRONMENT.md`: untracked, so there is no git baseline. Its mtime (11:39:57) matches the `wiremock/` and `compose.yaml` batch. No edit by this wave is visible.

### Findings

1. **Blocking. Test files are not type-checked by any gate.** `tsconfig.json` line 11 `"include": ["src"]` and `package.json` line 10 `"typecheck": "tsc --noEmit"`. `test/**` is governed by the code style (strict TypeScript, no `any`), but a type error in `test/` would pass typecheck, build and test. Both test files pass when checked explicitly (see gate table), so there is no current error, only an unguarded gate. **Fix (minimal):** add a `tsconfig.typecheck.json` that extends `tsconfig.json` with `"include": ["src", "test"]` and `"noEmit": true`. Point the `typecheck` script at it. Leave `build` on `src` so `dist/main.js` layout does not change. Then re-run typecheck, build and test.

### Non-blocking observations (not findings; do not change the verdict)

- `src/main.ts` line 6 calls `listen(config.port)` with no host, so the server binds all interfaces (observed as `::`). The requirements do not cover a host setting. Sam to decide whether the default should be `127.0.0.1`.
- `src/config.ts` line 15 uses `NodeJS.ProcessEnv`. The type comes from `@types/node` through `@types/express` and is not a direct dependency. Works today. Add `@types/node` only if Sam wants it explicit.
- The `Status` line above (step 2, verdict pending) is stale. This section supersedes it.

### Hand-off accuracy (Dan's note)

Checked against the run results. The npm script list, the `src/config.ts` contract, the defaults, the `createApp(): Express` export and the `typecheck` scope (`src` only) are accurate and match the code. The test count of 44 matches. The `npm install` and `0 vulnerabilities` claims were not re-verified by me.

### Re-review trigger

Re-run typecheck, build, `npm test`, and the three manual checks after finding 1 is fixed. Verdict becomes PASS only if all are green.

## scaffold-project review 2

**Reviewer:** Tom. **Date:** 2026-11-06 (19:46 UTC run). **Trigger:** Dan fix 1 for finding 1. **Shell note:** `npm.cmd` and `npx.cmd` used (execution policy blocks `npm.ps1`).

**Verdict: PASS**

### Finding 1 check (typecheck scope)

- `tsconfig.typecheck.json`: extends `tsconfig.json` (`strict: true` inherited), `noEmit: true`, `rootDir: "."`, `include: ["src", "test"]`.
- `package.json` line 9: `"typecheck": "tsc -p tsconfig.typecheck.json"`.
- `npx.cmd tsc -p tsconfig.typecheck.json --listFilesOnly` (excluding node_modules) lists `src/config.ts`, `src/server.ts`, `src/main.ts`, `test/config.test.ts`, `test/health.test.ts`. Exit 0.

### Gate runs (observed)

| Command | Result |
|---|---|
| `npm.cmd run typecheck` | exit 0 (covers src and test, see above) |
| `npm.cmd run build` (after deleting `dist\`) | exit 0. `dist\` contains exactly `config.js`, `main.js`, `server.js`. No test files. |
| `npm.cmd test` (`vitest run`) | 2 files passed, **44 tests passed, 0 failed**, exit 0 |

### Manual tests (observed)

| Step | Command | Observed |
|---|---|---|
| Start | `npm.cmd start` (async shell `srv`) | stdout: `Listening on port 3000` |
| Health | `curl.exe -i http://127.0.0.1:3000/health` | `HTTP/1.1 200 OK`, `Content-Type: application/json; charset=utf-8`, body `{"status":"ok"}`, curl exit 0 |
| Stop | `stop_powershell` on `srv`, then `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3000/health` | `000`, curl exit 7 (refused). Server stopped. |

### Code-style re-check

- `src/`: no comments, no `any`, no TODO. Only `console.log` is the startup line in `src/main.ts` line 7.
- URL, port and default literals in `src/` appear only in `src/config.ts` lines 42-51. `main.ts` reads the port via `loadConfig()`.
- `test/`: no `.only`, `.skip`, TODO or `console.log`.
- Previously checked items (AC1-AC8, protected files) were not re-raised; no change seen in `src/config.ts`, `src/server.ts` or `src/main.ts`.

### Findings

None blocking. Finding 1 from review 1 is resolved.

### Non-blocking items for wave end (do not change the verdict)

- `reasoning.md`, section `## hand-off`, still says `npm run typecheck`: `tsc --noEmit` (covers `src` only) and the "Notes for later waves" line about test type checks. Both are now wrong. Fix 1 says these notes are superseded, but the hand-off text itself is not updated. Dan should change it to `tsc -p tsconfig.typecheck.json` (covers `src` and `test`) before the wave-end hand-off check.
- Earlier non-blocking observations (bind-all-interfaces in `src/main.ts`, `NodeJS.ProcessEnv` from transitive `@types/node`) remain open for Sam. Not findings.
