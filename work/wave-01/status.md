# Wave 01 status (Max)

**Check:** scaffold-project, task-end and wave-end. **Date:** 2026-11-06. Build was not re-run. Results are taken from qa.md and reasoning.md. File contents were read directly.

**Overall: Open concerns: see items 1-5 below. Wave 01 is not ready to close.**

## Checks

| Check | Result | Evidence |
|---|---|---|
| Tom review 2 verdict | OK, PASS | qa.md "scaffold-project review 2" |
| Review 1 FAIL resolved | OK | reasoning.md "scaffold-project fix 1"; tsconfig.typecheck.json; package.json typecheck script |
| Scripts dev, build, start, typecheck, test | OK | package.json |
| tsconfig strict, ESM | OK | tsconfig.json (strict true, module NodeNext); package.json "type": "module" |
| Config defaults (11) and numeric rules | OK | src/config.ts vs AGENT Acceptance list |
| No URL, port or secret outside config | OK | src/server.ts, src/main.ts contain no literals |
| Health endpoint | OK | src/server.ts returns {status:"ok"}; tests recorded 44/44 pass (qa.md review 2) |
| Typecheck covers src and test | OK | tsconfig.typecheck.json; qa.md review 2 listFilesOnly |
| Manual start and curl | OK (recorded) | qa.md review 2, Dan reasoning.md Results |
| Test plan before implementation | CONCERN (minor) | qa.md line 52 "Not run"; no red run recorded (item 6) |
| requirements.md complete | CONCERN | requirements.md open questions 1-5; R7 (item 2) |
| reasoning.md hand-off | OK | Scripts and config contract match code; typecheck line updated |
| npm install and better-sqlite3 native build | CONCERN | reasoning.md Results; qa.md AC1 "install not re-run" (item 1) |
| Scope: src/ and test/ | OK | No extra routes, modules or exports beyond createApp and loadConfig |
| Scope: data/, docs/ | OK | Not present |
| Scope: .gitignore | CONCERN | Present at root, not in wave list, reasoning.md says none created (item 3) |
| Scope: wiremock/, compose.yaml, MOCK-ENVIRONMENT.md unchanged | CONCERN | Evidence relies on git, not reproducible (item 4) |
| Source: assignment PDF | CONCERN | requirements.md line 5 (item 5) |
| Docs hygiene | CONCERN (minor) | qa.md line 3 stale status line (item 6) |

## Concerns

1. **Native build not verified against the DoD.** Evidence: reasoning.md Results says npm did not run the better-sqlite3 install script ("Not approved"). DoD checklist item 1 requires the native build. AGENT "Risks" says to install it in this wave. Action: Sam decides. Either run the native build step and record the result, or amend the DoD to accept the shipped prebuild.
2. **requirements.md is not complete.** Evidence: open questions 1-5 have no answers. R7 still says "positive integer" with no PORT maximum. qa.md open question 5 asked Poppy to update R7, and that is not done. The PORT 65535 rule, the numeric format rules and leading zeros are cited as "SUP" in qa.md but are not recorded in requirements.md. Action: Poppy records the decisions and closes the questions.
3. **.gitignore is outside the wave list.** Evidence: .gitignore exists at the root. reasoning.md line 31 says "No .gitignore this wave". Its entries are project-specific, so it may predate wave 1. Action: Sam confirms who created it and when. Remove it or record it if wave 1 created it.
4. **Protected-file evidence is not reproducible.** Evidence: qa.md lines 109-110 rely on `git status`. No .git directory exists at the root. qa.md counts 19 tracked wiremock files, but 18 are visible. The environment also reports no git repository. Action: Tom re-checks with a method that works here, such as a baseline comparison. Until then, the unchanged status of wiremock/, compose.yaml and MOCK-ENVIRONMENT.md is unverified.
5. **Assignment PDF not read.** Evidence: requirements.md line 5 says the Take-Home PDF could not be read as text. task-cycle step 1 requires it. Action: Sam confirms the requirements against the PDF another way, or accepts the gap.
6. **Minor, non-blocking.**
   - qa.md line 3 still says "Verdict pending". It is superseded by the PASS, but the line stays. Tom to update it.
   - No red run was recorded before implementation (qa.md line 52). Tom to note this or accept it.
   - src/main.ts binds all interfaces. This is an open decision for Sam (qa.md non-blocking items).
   - Wave 2 risk: @types/better-sqlite3 ^9.6.0 against better-sqlite3 ^13.0.3 (package.json; reasoning.md notes). Wave 2 checks the types on first import.

## Closure recheck (Max)

**Date:** 2026-11-06. **Re-read scope (only):** requirements.md "Decisions"; qa.md lines 1-5 (verdict line) and "Test run before implementation"; reasoning.md "scaffold-project native build check" and "hand-off"; this file. No build or test re-run. The original concerns above are kept as the record.

**Overall: Open concerns: (a) and (b) need a decision; (c) is minor. See below.**

### Concern status

| # | Concern | Team record | Max result |
|---|---|---|---|
| 1 | better-sqlite3 native build | reasoning.md "native build check": shipped win32-x64 prebuild, module loads, SQLite 3.53.4. Sam accepts the prebuilt path for the DoD. | **Closed.** Consistent with the reasoning.md correction (13.0.3 has no install script). |
| 2 | Requirements open questions | requirements.md "Decisions" (SUP 1-8) closes them. | **Closed.** Decisions cover numeric rules, empty string, PORT max 65535, dev script, routes, port in use. Decisions item 2 overrides R7 "positive integer" for this wave. R7 wording and the requirements open-question list were not re-read (outside scope). See (b) for qa.md questions. |
| 3 | .gitignore outside wave list | Pre-existing project file, not created by this wave. | **Accepted** (Sam). Not re-checked. |
| 4 | Protected-file check without git | Accepted on file mtime. | **Accepted** (Sam). Note (c): the 18 vs 19 wiremock file count from the original concern is not reconciled in the record I could read. |
| 5 | Take-Home PDF not readable | Noted to user as open item. | **Accepted as non-blocking open item** (Sam). task-cycle step 1 still expects the PDF; the gap stays on record. |
| - | src/main.ts binds all interfaces | Sam keeps it for this wave; raise in a later wave review. | **Accepted for this wave. Deferred** to the wave review. |

### Open items

- **(a) No red run before implementation.** Evidence: qa.md "Test run before implementation" says no red run was captured because package.json, src/ and node_modules did not exist. The task-cycle expects tests to fail before code. **Action:** Sam or Tom accepts this gap in writing, or the gap stays open. Decision needed.
- **(b) qa.md open questions 1-4 not answered in Decisions.** Evidence: qa.md open questions 1 (createApp name), 2 (ESM .js import suffix), 3 (AC8 scope for the 127.0.0.1 literal in tests), 4 (content-type test not in requirements). requirements.md "Decisions" does not address them. The review 2 PASS may have resolved them, but that section was out of re-read scope. **Action:** Sam confirms each is resolved (point to the review 2 record or the decision), or records a decision.
- **(c) Minor, Tom to fix.** qa.md line 3 still reads "step 2 (tests first)... Implementation not started", which is stale against the PASS verdict. Wiremock count 18 vs 19 (concern 4) is not reconciled. **Action:** Tom updates the status line and records the wiremock count reconciliation.

### Closure verdict

All five concerns and the main.ts binding are closed or accepted. Wave 01 is not ready to close until (a) and (b) are decided. (c) is minor and does not block closure if Sam accepts it.
