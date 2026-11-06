## scaffold-project

**Wave:** 01 Foundation. **Goal:** a runnable Node.js + TypeScript skeleton with a validated config module and a GET /health endpoint. Wave 2 builds on it.

**Sources:** AGENT = `plan/wave-01-foundation/AGENT.md`. ENV = `MOCK-ENVIRONMENT.md`. SUP = supervisor decision (final for this wave). The Take-Home PDF could not be read as text, so no requirement cites it.

### Requirements

- **R1 Stack.** Node.js, TypeScript (strict, ESM), Express, better-sqlite3 (installed now, native build must succeed on Windows), Vitest. Source: AGENT "Fixed decisions" and "Risks".
- **R2 Scripts.** `package.json` has `dev`, `build`, `start`, `typecheck`, `test`. Source: AGENT "Tasks".
- **R3 tsconfig.** `"strict": true`, ESM output. Source: AGENT "Definition of Done".
- **R4 Files.** `package.json`, `tsconfig.json`, `src/config.ts`, `src/server.ts`, `src/main.ts`, `test/health.test.ts`, `test/config.test.ts`. Source: AGENT "Tasks" and "Validation tests".
- **R5 Config contract.** `src/config.ts` exports `loadConfig(env: NodeJS.ProcessEnv = process.env): Config` and type `Config` with fields `countryCode, port, productContextBaseUrl, availabilityBaseUrl, dbPath, concurrency, chunkSize, retryMaxAttempts, retryBaseMs, retryMaxMs, leaseTtlMs`. Source: SUP 2.
- **R6 Defaults.** When a variable is unset or empty, its field takes this default. Source: AGENT "Tasks" (acceptance list); names per SUP 2.

  | Env var | Field | Default |
  |---|---|---|
  | COUNTRY_CODE | countryCode | PT (ENV "configured country is PT") |
  | PORT | port | 3000 |
  | PRODUCT_CONTEXT_BASE_URL | productContextBaseUrl | http://127.0.0.1:8080 |
  | AVAILABILITY_BASE_URL | availabilityBaseUrl | http://127.0.0.1:8080 |
  | DB_PATH | dbPath | ./data/processor.db |
  | CONCURRENCY | concurrency | 8 |
  | CHUNK_SIZE | chunkSize | 500 |
  | RETRY_MAX_ATTEMPTS | retryMaxAttempts | 5 |
  | RETRY_BASE_MS | retryBaseMs | 200 |
  | RETRY_MAX_MS | retryMaxMs | 5000 |
  | LEASE_TTL_MS | leaseTtlMs | 30000 |

  127.0.0.1 is per AGENT and SUP 4. ENV examples use localhost; that is not a conflict for these defaults. Retry values are engineering defaults, not from the assignment (AGENT "Fixed decisions").
- **R7 Numeric validation.** PORT, CONCURRENCY, CHUNK_SIZE, RETRY_MAX_ATTEMPTS, RETRY_BASE_MS, RETRY_MAX_MS, LEASE_TTL_MS: if set and not a positive integer, `loadConfig` throws an Error whose message names the variable. No silent fallback. Valid means digits only (`^\d+$`), no sign, whitespace, decimal point or exponent, and greater than 0; leading zeros allowed. PORT must also be at most 65535. Source: SUP 1; Decisions 2.
- **R8 Health.** `GET /health` returns status 200 with JSON body `{"status":"ok"}`. Source: SUP 3; AGENT "Acceptance".
- **R9 Start.** `npm start` serves GET /health on PORT. Source: AGENT "Acceptance" and "Verification".
- **R10 Config only in config.ts.** No URL, port or secret is hard-coded outside `src/config.ts`. Source: AGENT "Definition of Done" and "Conventions".
- **R11 Protected files.** Do not modify `wiremock/__files`, `wiremock/mappings`, `compose.yaml`, `MOCK-ENVIRONMENT.md`. Source: AGENT "Conventions".
- **R12 Hand-off.** Wave 2 receives the npm scripts and the `src/config.ts` contract. Source: AGENT "Definition of Done".

### Acceptance criteria

AGENT has no labelled AC1–AC8 list. These are built from its "Acceptance" list and "Definition of Done" checklist (see open question 1).

- **AC1** `npm install`, `npm run typecheck`, `npm run build`, `npm test` all succeed with zero failures; the five scripts from R2 exist. (R1, R2)
- **AC2** With `npm start`, `GET http://127.0.0.1:3000/health` returns 200 and body `{"status":"ok"}`. (R8, R9)
- **AC3** With no env vars set, `loadConfig({})` returns every default in R6. (R6)
- **AC4** With `PORT` and `CONCURRENCY` set in the env object, `loadConfig` returns them as numbers in `port` and `concurrency`. (R5)
- **AC5** For each of the seven numeric variables in R7, a set value that is not a positive integer makes `loadConfig` throw an Error whose message contains that variable name. (R7)
- **AC6** An empty value (`""`) for any variable in R6 yields its default, not an error. (R6, R7)
- **AC7** `tsconfig.json` has `"strict": true` and ESM output. (R3)
- **AC8** No URL, port or secret literal appears outside `src/config.ts` (review check). (R10)

### Edge cases and fault inputs

- Numeric values that must throw (R7): `0`, `-1`, `1.5`, `abc`, `3000abc`.
- Empty string for a numeric variable: default applies (R6). Unset: default applies.
- Health: only GET /health is in scope. Other routes are not specified.
- Port already in use: out of scope, not tested this wave (SUP 5).

### Expected tests

- **Unit, `test/config.test.ts`:** defaults with an empty env object (AC3); PORT and CONCURRENCY parsed as numbers (AC4); each numeric variable rejects a bad value and names itself (AC5); empty value gives default (AC6). Pass an explicit env object; do not depend on the real process environment.
- **Component, `test/health.test.ts`:** a request to the Express app's GET /health gets status 200 and body `{"status":"ok"}` (AC2 part). Assert both status and body.
- **Manual verification, not Vitest:** `npm install`, `npm run typecheck`, `npm run build`, `npm test`, `npm start`, curl to /health (AC1, AC2, AC7 via file read).

### Decisions

Supervisor decisions (SUP), final for this wave.

1. **AC numbering.** AC1 to AC8 stay as written above. Sam accepts them.
2. **Numeric values.** Valid only if digits only (`^\d+$`), with no sign, whitespace, decimal point or exponent, and greater than 0. Leading zeros allowed. PORT must also be at most 65535. `"08"` is 8 (valid). `"1e3"`, `" 8"`, `"8 "`, `"+8"`, `"1.5"`, `"-1"`, `"0"`, `"abc"`, `"3000abc"` are invalid.
3. **Empty string.** For any variable, an empty string uses the default.
4. **No further validation.** COUNTRY_CODE and the base URLs are not validated beyond the empty-means-default rule.
5. **dev script.** `tsx watch src/main.ts`. DB_PATH is resolved relative to the working directory; the database opener in Wave 3 decides how to use it.
6. **Protected paths and file scope.** As in R11.
7. **Routes.** GET /health is the only route in this wave.
8. **Port in use.** A port already in use at startup is not tested in this wave.
