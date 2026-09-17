---
name: dev-stop
description: Stop the Eleven backend and frontend dev servers started by /dev (kills the process trees recorded in .dev/pids.json). Use when the user asks to stop the app, before restarting after config changes, or at the end of a testing session.
---

Stop the dev servers by running, with the PowerShell tool:

```
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev-stop.ps1
```

The script reads `.dev/pids.json`, kills each recorded process tree (`taskkill /T /F`), and
removes the PID file. If there is no PID file it does nothing except report whether ports
3001/5173 are held by some other process — it never kills processes it did not start. If
that happens, tell the user which PID holds the port and ask before killing it manually.

To restart after changes: run `/dev-stop` then `/dev`.
