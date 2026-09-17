---
name: bots
description: Launch AI bot players into an Eleven room so a game can be played or watched without other humans — join an existing room by code (human + bots) or create an all-bot room and start it. Use when the user wants to test a 4-player game alone, watch bots play, or smoke-test the full stack end to end.
arguments: [code, count]
---

Bots are real WebSocket clients (`server/src/bot/`) that see only their own `GameView`, so a
bot game exercises the server, protocol, views and policy exactly like humans would.
The dev servers must be running first (`/dev`).

Run with the PowerShell tool from the repo root:

- Join an existing room (the human created it in the browser and will press 시작):
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bots.ps1 -Code $code -Count $count`
  (`$count` defaults to 3 → human + 3 bots.)
- All-bot room, started immediately (watch it via 관전 in the browser with the printed code):
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bots.ps1 -Create -Count 4 -Start`
- Slow down/speed up with `-Delay <ms>` (default 400; 0 for a fast headless run).

The script starts the bot process hidden, records its PID in `.dev/bots-<code>.pid`, and logs
to `.dev/bots-<code>.log`. After it prints, read the log tail and report the room code and
whether the bots joined. `/dev-stop` also kills bot processes. If a bot logs repeated
`거부:` lines for the same action, that is a policy bug in `server/src/bot/policy.ts`, not a
server bug — fix the policy rather than the engine.
