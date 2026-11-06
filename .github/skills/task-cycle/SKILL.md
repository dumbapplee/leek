---
name: task-cycle
description: The mandatory per-task cycle (requirements, tests first, implementation, QA review) used inside every wave. Use when planning, running, or checking a task.
---

# Task cycle

Every task in a wave goes through these steps in order. No step is skipped. The next task starts only after step 6.

1. **Requirements (Poppy).** Read the task in `plan/wave-NN-*/AGENT.md`, `MOCK-ENVIRONMENT.md` and the assignment PDF. Write to `work/wave-NN/requirements.md`: the task, the source reference for each requirement, acceptance criteria, edge cases, and the tests expected.
2. **Tests first (Tom).** Read the requirements. Ask Poppy through Sam if anything is unclear. Write unit and component tests in `test/`. Record the test plan in `work/wave-NN/qa.md`. Tests may fail at this point, they define the target.
3. **Implement (Dan).** Make the tests pass with the simplest conforming code. Do not change Tom's tests. If a test looks wrong, report it to Sam. Log decisions in `work/wave-NN/reasoning.md`.
4. **Verify (Dan).** Run the wave verification commands (typecheck, build, test). All green before handing over.
5. **Review (Tom).** Review the code against `.github/instructions/code-style.instructions.md` and the acceptance criteria. Run manual tests (real runs against WireMock where relevant). Write the result in `qa.md` as PASS or FAIL with reasons.
6. **Gate (Sam).** FAIL: back to step 3 with Tom's findings. PASS: mark the task done and start the next task at step 1.

## Wave end
- Max checks `work/wave-NN/` for completeness and writes `status.md`.
- Sam closes the wave only when every task passed and Max raised no open concern.
- Hand-off note for the next wave comes from Dan, verified by Tom.

## File entry format
Start each task entry with `## <task-id>` and keep entries to a few lines.
