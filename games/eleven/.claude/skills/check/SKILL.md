---
name: check
description: Run the full Eleven quality gate — TypeScript typecheck for server and client, ESLint, and the server engine tests (vitest) — and summarize any failures. Use after finishing a change, before reporting work as done, or when the user asks to verify/test the code.
---

Run, with the PowerShell tool from the repo root:

```
npm run check
```

This runs `typecheck` in both workspaces, `eslint .`, then `vitest run` in `server/`.
It stops at the first failing stage.

Then:
- If everything passes, say so in one line.
- If a stage fails, list each distinct error with `file:line` and a one-line cause, fix the
  underlying problem, and re-run `npm run check` until it is green. Do not suppress rules,
  add `// @ts-ignore`, or skip tests to get past a failure.
- To run a single stage: `npm run typecheck`, `npm run lint`, or `npm run test`. For a single
  test file: `npm run test -w server -- <path>`.
