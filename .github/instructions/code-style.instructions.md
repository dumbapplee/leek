---
applyTo: "src/**,test/**"
---

# Code style

- Match the existing code first: same naming, folder layout, error handling, and patterns. Read neighbouring files before writing.
- Reuse existing modules (HTTP client, retry helper, DB opener, config). Never build a parallel version. Do not reinvent what Node, Express, better-sqlite3 or Vitest already provide.
- TypeScript strict, ESM, camelCase file names, explicit types at module boundaries, no `any`.
- Small functions with one job and intention-revealing names. Prefer simple over clever.
- Read configuration only through `src/config.ts`.
- Comments: avoid. Only when the why is not obvious. One line, a few words, direct.
- Tests: Vitest in `test/`, named `<subject>.test.ts`. One behaviour per test. Names state the behaviour. No network to real hosts; use WireMock or fakes as the wave brief says.
- No dead code, no commented-out code, no TODOs left behind.
