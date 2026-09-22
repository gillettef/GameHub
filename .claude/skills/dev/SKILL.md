---
name: dev
description: 로컬 테스트용으로 백엔드(server, 3001)와 프론트엔드(client, 5173)를 현재 터미널의 백그라운드에서 함께 실행한다. "서버 켜줘", "dev 서버 실행", "로컬에서 띄워줘" 요청 시 사용. 종료는 /dev-stop.
---

# /dev — 백엔드·프론트엔드 백그라운드 실행

서버(`server/`, 포트 3001)와 클라이언트(`client/`, 포트 5173)를 분리된 백그라운드 프로세스로 띄운다.
프로세스는 터미널을 블로킹하지 않으며, PID는 `.dev/*.pid`, 로그는 `.dev/*.log`에 기록된다.

## 실행 절차

1. Bash 툴로 아래 명령을 **포그라운드**로 실행한다 (스크립트 자체는 프로세스를 분리한 뒤 곧바로 반환한다).

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1
   ```

2. 출력에서 각 프로세스의 상태를 확인한다.
   - `started PID ... -> http://localhost:PORT` : 정상
   - `already running` : 이미 실행 중. 그대로 사용한다.
   - `port ... already in use by another process` : `/dev-stop` 을 먼저 실행한 뒤 다시 시도한다.
   - `exited early` : 스크립트가 로그 마지막 20줄을 출력한다. 원인을 고친 뒤 재실행한다.
   - `package.json not found - skipping` : 해당 워크스페이스가 아직 스캐폴딩되지 않았다. CLAUDE.md의 디렉터리 구조대로 먼저 생성한다.

3. 사용자에게 접속 URL을 알려준다.
   - 클라이언트: http://localhost:5173
   - 서버: http://localhost:3001

## 로그 확인

```
tail -n 50 .dev/server.log
tail -n 50 .dev/client.log
tail -n 50 .dev/server.err.log
```

## 주의

- `npm run dev`를 Bash 툴에서 직접 실행하지 않는다. 터미널이 블로킹된다.
- 코드 변경 후 재시작이 필요하면 `/dev-stop` → `/dev` 순으로 실행한다. (Vite와 tsx/nodemon은 대부분 핫리로드되므로 보통은 재시작 불필요)
- 의존성이 없으면 스크립트가 루트에서 `npm install`을 자동 실행한다.
