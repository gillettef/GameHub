---
name: check
description: Run the full Eleven quality gate — TypeScript typecheck, ESLint, vitest (engine, GameDef, client helpers) and the build — and summarize any failures. Use after finishing a change, before reporting work as done, or when the user asks to verify/test the code.
---

GameHub 루트 workspaces 의 한 패키지(`games/eleven`)다. 모노레포 루트에서 PowerShell 로 실행한다:

```
npm run check
```

루트 `check` 는 모든 workspace 의 `typecheck` → 루트 `eslint`(packages·옮긴 게임) → `vitest run` → `build` 순서다.
화면을 바꿨으면 이어서 `npm run e2e -w games/eleven`(iPhone 화면 캡처·배치 검사, `games/eleven/shots/`)도 돌린다.

Then:
- If everything passes, say so in one line.
- If a stage fails, list each distinct error with `file:line` and a one-line cause, fix the
  underlying problem, and re-run until it is green. Do not suppress rules,
  add `// @ts-ignore`, or skip tests to get past a failure.
- This game only: `npm run typecheck -w games/eleven`, `npm run test -w games/eleven`,
  single file `npm run test -w games/eleven -- src/engine/friday.test.ts`.
