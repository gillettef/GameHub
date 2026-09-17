---
name: bots
description: Explain or set up AI bot players for Eleven — the normal way is the 🤖 "AI 추가" button in the room lobby (server-side bots, no extra process); the CLI in server/src/bot/run.ts is only for headless all-bot rooms or stack smoke tests. Use when the user wants to test a 4-player game alone, watch bots play, or run a headless bot game.
arguments: [code, count]
---

## Normal use (no commands needed)
The host creates a room in the browser and presses **🤖 AI 추가** in the room lobby up to 4
players, then **게임 시작**. Bots run inside the server (`server/src/bot/driver.ts`): after every
human action the driver lets each bot act one step at a time (delay `BOT_DELAY_MS`, default 300 ms)
until no bot has anything to do. Bots see only their own `GameView`, same as humans. Tell the
user this first; only fall back to the CLI below if they explicitly want a headless/all-bot run.

## Headless all-bot room (CLI)
Dev servers must be running (`/dev`). From the repo root with the PowerShell tool:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bots.ps1 -Create -Count 4 -Start`

This starts a hidden process of `npm run bots -w server -- create 4 start` (positional args —
PowerShell's `npm` wrapper strips `--flags`, so prefer positionals or `npm.cmd`), records its PID in
`.dev/bots-create.pid`, logs to `.dev/bots-create.log` (read with `-Encoding utf8`). The log prints
the room code; the user can watch it via 관전 in the browser. `-Delay <ms>` controls speed.
`/dev-stop` also kills bot processes. `-Code <code> -Count <n>` joins an existing *not yet started*
room with external ws bots if ever needed.

If bots log repeated `거부:` for the same action, that is a policy bug in
`server/src/bot/policy.ts`, not an engine bug — fix the policy.
