---
name: prod-server
description: 친구들이 웹으로 접속하는 운영 서버를 실행한다. 클라이언트를 빌드해 Node 서버(3201)가 정적 서빙하고, Python AI(8001)를 띄우고, Cloudflare 빠른 터널로 공개 주소(*.trycloudflare.com)를 만든다. "운영 서버 켜줘", "친구들 접속 서버 실행", "배포해줘" 요청 시 사용. 종료는 /prod-server-stop.
---

# /prod-server — 운영 서버 실행 (prod)

`scripts/serve.ps1 -Env prod` 로 아래 세 프로세스를 백그라운드로 띄운다. PID는 `.dev/prod-*.pid`, 로그는 `.dev/prod-*.log`.

| 프로세스 | 내용 |
|---|---|
| `prod-ai` | `ai/.venv` uvicorn, 127.0.0.1:8001 (리로드 없음) |
| `prod-server` | `server/` tsx, 0.0.0.0:3201. `client/dist/prod` 를 같은 포트에서 정적 서빙 |
| `prod-tunnel` | `.dev/bin/cloudflared.exe` 빠른 터널 → 공개 URL. 없으면 GitHub 릴리스에서 자동 다운로드 |

시작 전에 `client/dist/prod` 를 새로 빌드한다 (`-NoBuild` 로 생략 가능). 데이터 디렉터리는 `server/data/prod`.

## 실행 절차

1. Bash 툴로 **포그라운드** 실행한다 (스크립트는 프로세스를 분리한 뒤 곧바로 반환한다. 출력을 `| grep` 등으로 파이프하지 않는다).

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Env prod
   ```

   코드가 바뀌지 않았고 빌드를 건너뛰려면 `-NoBuild`, 터널 없이 LAN만 쓰려면 `-NoTunnel` 을 붙인다.

2. 출력을 확인한다.
   - `[prod-server] started PID ...` / `[prod-ai] started PID ...` : 정상
   - `already running` : 이미 실행 중. 코드를 반영하려면 `/prod-server-stop` 후 다시 실행한다.
   - `port ... already in use by another process` : 3201/8001 을 다른 프로세스가 쓰고 있다. `/prod-server-stop` 을 먼저 실행한다. 포트 3001(Eleven)은 절대 건드리지 않는다.
   - `exited early` : 로그 마지막 20줄이 출력된다. 원인을 고친 뒤 재실행한다.
   - `tunnel URL not found yet` : `.dev/prod-tunnel.err.log` 를 확인한다. 터널만 실패한 경우 서버는 LAN 주소로 접속 가능하다.

3. 사용자에게 마지막 블록의 주소를 알려준다. **친구에게 공유할 주소는 `Public :` 줄의 `https://….trycloudflare.com`** 이다. 공개 주소는 `.dev/prod-url.txt` 에도 저장된다. 빠른 터널은 시작할 때마다 주소가 바뀌므로 재시작하면 다시 공유해야 한다.

## 로그 확인

```
tail -n 50 .dev/prod-server.log
tail -n 50 .dev/prod-server.err.log
tail -n 50 .dev/prod-ai.err.log        # uvicorn은 stderr에 로그를 쓴다
tail -n 50 .dev/prod-tunnel.err.log    # cloudflared 도 stderr
```

## 주의

- 운영 서버는 핫리로드하지 않는다. 코드를 바꿨으면 `/prod-server-stop` → `/prod-server` 로 재시작한다(빌드 포함).
- dev(3101/5173/8000)·test(3301/8002) 와 포트가 분리돼 있어 동시에 띄울 수 있다.
- 검증하지 않은 변경은 먼저 `/test-server` 에서 확인한 뒤 운영에 올린다.
