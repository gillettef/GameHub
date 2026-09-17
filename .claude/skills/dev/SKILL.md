---
name: dev
description: Start the Eleven backend (server/, port 3001) and frontend (client/, port 5173) dev servers in the background and report their URLs and log files. Use when the user asks to run/start the app, or before testing a UI change in a browser.
---

Start both dev servers in the background by running, with the PowerShell tool:

```
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

The script starts `npm run dev` in `server/` and `client/`, writes PIDs to `.dev/pids.json`,
and logs to `.dev/server.log` / `.dev/client.log` (stderr in `*.err.log`). It skips any
target that has no `package.json` yet, and refuses to start if `.dev/pids.json` already
exists — in that case run `/dev-stop` first.

After it finishes:
- Report the URLs (server http://localhost:3001, client http://localhost:5173) and which
  targets actually started.
- If a port is not listening, read the tail of the corresponding `.dev/*.log` and
  `.dev/*.err.log`, diagnose, and fix the underlying issue rather than retrying blindly.
- Do not use Bash `run_in_background` for the dev servers — the script owns the process
  lifecycle so `/dev-stop` can reliably kill the whole process tree.
