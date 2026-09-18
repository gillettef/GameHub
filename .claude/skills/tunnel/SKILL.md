---
name: tunnel
description: Expose the Eleven game to friends on other networks from this PC — builds the client+server, starts the production server (port 3001, serving the built client) and opens a Cloudflare quick tunnel (no account needed), then reports the public https://….trycloudflare.com URL. If a tunnel is already running, use -Reload to rebuild and swap only the game server so the public URL stays the same. Use when the user wants to play with people outside the local network right now without deploying to a host, or to push a new build to the running tunnel. Stop with /dev-stop.
---

Two modes, both with the PowerShell tool:

**A tunnel is already running** (`.dev/tunnel-pids.json` exists — this is the usual case after code
changes): rebuild and swap only the game server. The public URL does not change because it is tied to
the `cloudflared` process, which stays up.

```
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel.ps1 -Reload
```

**No tunnel yet** (first start, or after `/dev-stop`): build, start the server and open a new tunnel
(build ~10s, tunnel URL appears within ~30s). This assigns a *new* random URL.

```
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel.ps1
```

Prefer `-Reload` whenever the tunnel is up — do not stop and restart the whole tunnel just to deploy a
build, since that changes the URL the user has already shared. Only fall back to `/dev-stop` + full
start when the script says the tunnel process is gone.

The full start refuses if `.dev/tunnel-pids.json` exists or port 3001 is held (the `/dev` dev server
uses the same port — run `/dev-stop` first). It downloads `cloudflared.exe` into `.dev/` on first use,
runs `npm run build`, starts `node server/dist/index.js` (which serves `client/dist` and `/ws` on one
origin), starts `cloudflared tunnel --url http://localhost:3001`, and records both PIDs in
`.dev/tunnel-pids.json`. Logs: `.dev/serve*.log`, `.dev/tunnel*.log`. The public URL is saved to
`.dev/tunnel-url.txt`; `-Reload` prints it again at the end.

After it finishes:
- Give the user the public URL (unchanged after `-Reload`) and tell them friends join by room code.
  The URL only works while this PC keeps the tunnel running; it changes when the tunnel is restarted.
- Either mode restarts the game server, so a game in progress is lost (state is in memory) — say so.
- Pass `-SkipBuild` to reuse the previous build.
- To stop everything, run `/dev-stop` (it also kills tunnel processes).
- If no URL appears, read the tail of `.dev/tunnel.err.log` and diagnose (usually no internet
  or the download failed) rather than retrying blindly.
