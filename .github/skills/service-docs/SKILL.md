---
name: service-docs
description: Final service documentation in /docs, written after QA sign-off including manual tests. Use in the documentation wave.
---

# Service docs

Run only after Tom has signed off all implementation waves and manual tests.

## Output
Root `README.md` is the solution README. Details in `docs/`:
- `solution.md`: what the service does, architecture, data flow, how to run, config.
- `decisions.md`: each key decision, the alternatives, and why. Source it from every `work/wave-NN/reasoning.md`.
- `verification.md`: how it was tested, commands, manual test results from every `work/wave-NN/qa.md`.

## Rules
- Describe only what exists in the code. Verify against the source, do not copy plans.
- Short, direct, no filler, no emojis, English.
- Keep the Farfetch'd image already in `README.md`.
- Commands must be copy-paste runnable. Run them to confirm.
- Follow `plan/wave-08-documentation/AGENT.md` for the exact scope.
