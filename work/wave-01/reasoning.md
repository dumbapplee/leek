# Wave 01 reasoning (Dan)

## scaffold-project

**Done.** Created `package.json`, `tsconfig.json`, `src/config.ts`, `src/server.ts`, `src/main.ts`. Ran `npm install` (runtime: express, better-sqlite3; dev: @types/express, @types/better-sqlite3, tsx, typescript, vitest). Tests in `test/` not modified.

**Decisions and reasons**
- Scripts exactly as supervisor set. `start` runs `dist/main.js`, so `tsconfig` uses `rootDir: src`, `outDir: dist`.
- `tsconfig` includes `src` only. Including `test` would move the output to `dist/src/...` and break `dist/main.js`. A second tsconfig is an extra file outside the brief. Tests are type-checked by hand (see results), not by `typecheck`.
- `module`/`moduleResolution` NodeNext, `strict: true`, `target` ES2022. Needed for ESM and the `.js` import suffix used by Tom's tests.
- Numeric parsing: `/^\d+$/` then `Number()`. Rejects `-1`, `1.5`, `abc`, `3000abc`, ` 8`, `8 `, `+8`, `1e3`, `0`. Accepts `08`. Rejected `Number()` alone (accepts `" 8"`, `""` as 0) and `parseInt` (reads `3000abc` as 3000).
- Empty or unset uses the default (falsy check). Strings are not validated (no requirement; qa open question 4 open).
- Optional `max` argument: only PORT passes 65535. Error message names the variable and the raw value.
- `Config` is an interface (matches Tom's usage). Defaults live only in `config.ts` (R10).
- `createApp()` returns `Express`. `main.ts` listens on `config.port` with no host, so it binds all interfaces. The spec has no HOST setting; curl to 127.0.0.1 works.
- `@types/node` not added. It comes in through `@types/express`. Keeps the dependency list to the brief.

**Deviations from brief:** none in files. `tsconfig` scope is `src` only (see above).

**Results**
- `npm install`: succeeded, 0 vulnerabilities. npm 11 reports install scripts for better-sqlite3 (`node-gyp rebuild`) and esbuild as not run. Not approved, so no `node-gyp` compile. better-sqlite3 loads from its shipped `win32-x64` prebuild; a `:memory:` query returns SQLite 3.53.4. No native build error.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0.
- `npm test`: 2 files, 44 passed, 0 failed.
- `tsc --ignoreConfig --noEmit --strict` on `test/config.test.ts` and `test/health.test.ts`: exit 0.
- `npm start`: listening on 3000. `GET http://127.0.0.1:3000/health` returned 200, body `{"status":"ok"}`, `application/json`. Server stopped, port 3000 free.

**Notes for later waves**
- `@types/better-sqlite3` resolved to ^9.6.0 while `better-sqlite3` is ^13.0.3. Check the types match when Wave 2 first imports it.
- `TypeScript` resolved to ^7.0.2. The build and typecheck pass.
- `dist/` and `node_modules/` exist now. No `.gitignore` this wave (brief).

## hand-off

**npm scripts**
- `npm run dev`: `tsx watch src/main.ts`
- `npm run build`: `tsc` to `dist/`
- `npm start`: `node dist/main.js`
- `npm run typecheck`: `tsc -p tsconfig.typecheck.json` (covers `src` and `test`)
- `npm test`: `vitest run`

**`src/config.ts` contract**
- `export interface Config` with fields: `countryCode: string`, `port: number`, `productContextBaseUrl: string`, `availabilityBaseUrl: string`, `dbPath: string`, `concurrency: number`, `chunkSize: number`, `retryMaxAttempts: number`, `retryBaseMs: number`, `retryMaxMs: number`, `leaseTtlMs: number`.
- `export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config`.
- Defaults: COUNTRY_CODE `PT`, PORT `3000`, PRODUCT_CONTEXT_BASE_URL and AVAILABILITY_BASE_URL `http://127.0.0.1:8080`, DB_PATH `./data/processor.db`, CONCURRENCY `8`, CHUNK_SIZE `500`, RETRY_MAX_ATTEMPTS `5`, RETRY_BASE_MS `200`, RETRY_MAX_MS `5000`, LEASE_TTL_MS `30000`.
- Unset or empty uses the default. Numerics must match `/^\d+$/` and be >= 1; otherwise throws `Error` naming the variable. PORT max 65535.
- Note for Wave 2: `@types/better-sqlite3` is ^9.6.0 while `better-sqlite3` is ^13.0.3. Check the types match when first imported.

**Other exports:** `createApp(): Express` in `src/server.ts` (serves GET /health). `src/main.ts` is the entry point.

## scaffold-project fix 1

**Trigger:** Tom QA FAIL, finding 1. `typecheck` covered `src` only, so a type error in `test/` would pass the gate.

**What changed**
- New `tsconfig.typecheck.json`: extends `tsconfig.json`, `noEmit: true`, `rootDir: "."`, `include: ["src", "test"]`.
- `package.json` `typecheck` script: `tsc --noEmit` changed to `tsc -p tsconfig.typecheck.json`.
- `tsconfig.json` unchanged (build still `src` only, so `dist/` has no test files). No change to `src/` or `test/`.

**Reason for `rootDir: "."`:** the base config sets `rootDir: "src"`, which would reject `test/` files. Overriding it keeps the typecheck scope to both folders.

**Superseded by this fix:** the earlier note "typecheck: `tsc --noEmit` (covers `src` only)" and "tests are type-checked by hand" no longer apply. `typecheck` now covers `src` and `test`.

**Results**
- `npm run typecheck`: exit 0. `--listFilesOnly` lists `src/config.ts`, `src/server.ts`, `src/main.ts`, `test/config.test.ts`, `test/health.test.ts`.
- `npm run build`: exit 0.
- `dist/` after build: `config.js`, `main.js`, `server.js` only. No test files.
- `npm test`: 2 files passed, 44 tests passed, 0 failed, exit 0.
- `npm start` (async shell): `GET http://127.0.0.1:3000/health` returned 200, `application/json; charset=utf-8`, body `{"status":"ok"}`. Server stopped via `stop_powershell`. Port 3000 no longer answers.

## scaffold-project native build check

**Trigger:** Max check concern. better-sqlite3 native build path not yet run on Windows.

**Commands and results**
- `npm rebuild better-sqlite3` (PowerShell): failed before running. `npm.ps1` blocked by execution policy (`running scripts is disabled on this system`). Exit 1. No policy or config changed.
- `npm.cmd rebuild better-sqlite3 --foreground-scripts`: exit 0. Output: `rebuilt dependencies successfully`. Warning: `1 package has install scripts not yet covered by allowScripts`.
- `npm install-scripts ls`: only `esbuild@0.28.2` (postinstall) is listed. better-sqlite3 is not listed.
- `node -e "...new D(':memory:')...select sqlite_version()..."`: exit 0, output `{ v: '3.53.4' }`. No file created in `data\` or on disk.
- `node_modules\better-sqlite3\build\` does not exist.

**Build path: prebuilt, shipped in the package. No source compile.**
- better-sqlite3 13.0.3 `package.json` has no `install` script (`scripts` holds only `build-release`, `build-debug`, `test`, `benchmark`, `download`, `clean`). Nothing was downloaded or compiled during the rebuild.
- `lib/win32-x64.js` loads `../prebuilds/win32-x64.node`, which is present (1989632 bytes).

**Correction to earlier note:** the Results entry above says npm 11 reports better-sqlite3 `node-gyp rebuild` as not run. For 13.0.3 that is not accurate. The package has no install script, and `install-scripts ls` now lists only esbuild. Max's concern (a skipped better-sqlite3 build) does not apply to this version. The native binary is the shipped prebuild.

**Decisions and reasons**
- Used `npm.cmd` instead of `npm`. Same npm, no policy change. Avoids touching the execution policy on the machine.
- Did not set `ignore-scripts`, approve esbuild, or change `package.json`. Not needed for better-sqlite3.
- Did not run `npm install` again. The rebuild and load check are enough to close the concern.

**Result:** pass. Prebuilt path. SQLite 3.53.4.

**Open for Sam:** the DoD wording "including the better-sqlite3 native build on Windows" is met by the shipped prebuild, not by a local compile. Sam to decide if that satisfies the DoD for 13.0.3.