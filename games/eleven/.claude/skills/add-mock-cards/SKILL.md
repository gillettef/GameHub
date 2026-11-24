---
name: add-mock-cards
description: Generate or extend mock/placeholder card data (players, staff, sponsors, board/director cards, tactic cards, objective cards, opponent team cards, executive cards) for the Eleven project, following CLAUDE.md's Mock 데이터 정책 and the schema patterns shown in notes/Eleven_Rulebook.md.
context: fork
agent: mock-card-designer
background: false
arguments: [card_type, count]
disable-model-invocation: false
---

Create $count mock/placeholder cards of type "$card_type" for the Eleven project, per the
Mock 데이터 정책 in `CLAUDE.md`. Base the schema on the example card(s) of this type shown in
`notes/Eleven_Rulebook.md`, keep numeric values within the ranges implied there, mark the
output clearly as placeholder data, and write it to an appropriately named data file
(check for an existing data directory/convention first; don't hardcode into engine or UI code).

If `$card_type` is ambiguous or doesn't match a known card type from the rulebook (선수/유망주/
베테랑, 직원, 스폰서, 이사회, 임원, 목표, 전술, 상대 팀), ask for clarification instead of guessing.

Existing data lives in `server/src/data/*.mock.ts` (typed by `server/src/engine/types.ts`,
validated by `server/src/data/data.test.ts`) — extend those files and keep their conventions.
The designer agent cannot run commands; after it returns, run `/check` to validate the result.
