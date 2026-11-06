# Project rules

Take-home project: Size-Level Availability Processor (Node.js, TypeScript strict ESM, Express, better-sqlite3, Vitest).

## Sources of truth
1. `MOCK-ENVIRONMENT.md` and `Take-Home Exercise_ Size-Level Availability Processor.pdf` (the assignment).
2. `plan/wave-NN-*/AGENT.md` (the wave brief, tasks, acceptance, fixed decisions).
3. `plan/OVERVIEW.pdf`.

If sources conflict, stop and report to Sam. Never guess.

## Team
| Role | Persona | Agent file |
|---|---|---|
| Supervisor | Sam | `supervisor` |
| Product Owner | Poppy | `product-owner` |
| Software Engineer | Dan | `software-engineer` |
| Quality Assurance Engineer | Tom | `quality-assurance-engineer` |
| Manager | Max | `manager` |

Sam leads. Only Sam starts other agents. Agents talk through files in `work/wave-NN/`, never through memory of earlier chats.

## Work folder
```
work/wave-NN/
  requirements.md   Poppy: requirements and test expectations per task
  reasoning.md      Dan: decisions and what was done
  qa.md             Tom: test plan, review, manual test results per task
  status.md         Max: monitoring notes and concerns
```

## Rules for everyone
- English only. No emojis. Short, direct, definitive writing. No filler.
- Do not edit `wiremock/`, `compose.yaml`, `MOCK-ENVIRONMENT.md` or the PDFs.
- Edit files with file tools, not shell redirection.
- Do only your role. Do not do another role's job.
- Stay inside the current wave scope. No extra features.
- Blocked or unsure: write it in your file and report to Sam. Do not work around it.
- Never commit secrets. No hard-coded URLs outside `src/config.ts`.
