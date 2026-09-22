---
name: test-server
description: 운영에 올리기 전 검증용 테스트 서버를 실행한다. 클라이언트를 빌드해 Node 서버(3301)가 정적 서빙하고, Python AI(8002)를 띄우고, Cloudflare 빠른 터널로 공개 주소를 만든다. 운영(3201)과 동시에 띄울 수 있다. "테스트 서버 켜줘", "스테이징 실행", "친구랑 테스트할 서버" 요청 시 사용. 종료는 /test-server-stop.
---

# /test-server — 테스트 서버 실행 (test)

`scripts/serve.ps1 -Env test` 로 아래 세 프로세스를 백그라운드로 띄운다. PID는 `.dev/test-*.pid`, 로그는 `.dev/test-*.log`.

| 프로세스 | 내용 |
|---|---|
| `test-ai` | `ai/.venv` uvicorn, 127.0.0.1:8002 |
| `test-server` | `server/` tsx, 0.0.0.0:3301. `client/dist/test` 를 같은 포트에서 정적 서빙 |
| `test-tunnel` | `.dev/bin/cloudflared.exe` 빠른 터널 → 공개 URL |

운영과 빌드 디렉터리(`client/dist/test`)·데이터 디렉터리(`server/data/test`)·포트가 모두 분리돼 있어 운영 서버에 영향을 주지 않는다.

## 실행 절차

1. Bash 툴로 **포그라운드** 실행한다 (출력을 파이프하지 않는다).

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Env test
   ```

   빌드 생략은 `-NoBuild`, 터널 없이 LAN만은 `-NoTunnel`.

2. 출력을 확인한다. 항목별 의미는 `/prod-server` 와 같다 (`started` 정상, `already running` 은 `/test-server-stop` 후 재실행, `port ... in use` 는 3301/8002 점유, `exited early` 는 로그 확인).

3. 사용자에게 `Public :` 줄의 `https://….trycloudflare.com` 주소를 알려준다 (`.dev/test-url.txt` 에도 저장). 재시작하면 주소가 바뀐다.

## 로그 확인

```
tail -n 50 .dev/test-server.log
tail -n 50 .dev/test-server.err.log
tail -n 50 .dev/test-ai.err.log
tail -n 50 .dev/test-tunnel.err.log
```

## 주의

- 핫리로드 없음. 코드를 바꿨으면 `/test-server-stop` → `/test-server`.
- 테스트에서 확인이 끝난 변경만 `/prod-server` 로 올린다.
