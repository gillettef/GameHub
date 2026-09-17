---
name: tunnel
description: Expose the Eleven game to friends on other networks from this PC — builds the client+server, starts the production server (port 3001, serving the built client) and opens a Cloudflare quick tunnel (no account needed), then reports the public https://….trycloudflare.com URL. Use when the user wants to play with people outside the local network right now without deploying to a host. Stop with /dev-stop.
---

Run, with the PowerShell tool (build takes ~10s, tunnel URL appears within ~30s):

```
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel.ps1
```

The script refuses to start if `.dev/tunnel-pids.json` exists or port 3001 is already held
(the `/dev` dev server uses the same port — run `/dev-stop` first). It downloads
`cloudflared.exe` into `.dev/` on first use, runs `npm run build`, starts
`node server/dist/index.js` (which serves `client/dist` and `/ws` on one origin), starts
`cloudflared tunnel --url http://localhost:3001`, and records both PIDs in
`.dev/tunnel-pids.json`. Logs: `.dev/serve*.log`, `.dev/tunnel*.log`. The public URL is also
saved to `.dev/tunnel-url.txt`.

After it finishes:
- Give the user the public URL and tell them to send it to friends, who join by room code.
  The URL changes every time the tunnel restarts and only works while this PC is running it.
- Pass `-SkipBuild` to reuse the previous build.
- To stop everything, run `/dev-stop` (it also kills tunnel processes).
- If no URL appears, read the tail of `.dev/tunnel.err.log` and diagnose (usually no internet
  or the download failed) rather than retrying blindly.
