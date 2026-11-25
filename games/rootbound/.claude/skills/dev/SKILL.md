---
name: dev
description: 로컬 테스트용으로 백엔드(server, 3101, AI 포함)와 프론트엔드(client, 5173)를 현재 터미널의 백그라운드에서 함께 실행한다. "서버 켜줘", "dev 서버 실행", "로컬에서 띄워줘", "휴대폰·친구 기기에서 해 보고 싶어" 요청 시 사용. Cloudflare 빠른 터널로 다른 기기에서 열 수 있는 공개 주소(*.trycloudflare.com)도 만든다. 종료는 /dev-stop.
---

# /dev — 백엔드·프론트엔드 백그라운드 실행

서버(`server/`, 3101, AI 는 서버 안에서 돈다)와 클라이언트(`client/`, 5173)를 분리된 백그라운드 프로세스로 띄운다.
이어서 Cloudflare 빠른 터널(`.dev/bin/cloudflared.exe`, 계정 불필요, 없으면 내려받는다)로 Vite(5173)를 인터넷에 공개한다. 휴대폰·다른 PC·친구는 같은 와이파이가 아니어도 공개 주소로 접속한다. `/api`·`/socket.io` 는 Vite 프록시가 이 PC 안에서 3101 로 넘기므로 공개되는 포트는 하나다. 방화벽 설정은 필요 없다.
프로세스는 터미널을 블로킹하지 않으며, PID는 `.dev/*.pid`, 로그는 `.dev/*.log`에 기록된다.

## 실행 절차

1. Bash 툴로 아래 명령을 **포그라운드**로 실행한다 (스크립트 자체는 프로세스를 분리한 뒤 곧바로 반환한다).

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1
   ```

   터널 없이 이 PC에서만 쓰려면 끝에 `-NoTunnel` 을 붙인다.

2. 출력에서 각 프로세스의 상태를 확인한다.
   - `started PID ... -> http://localhost:PORT` : 정상
   - `already running` : 이미 실행 중. 그대로 사용한다.
   - `port ... already in use by another process` : `/dev-stop` 을 먼저 실행한 뒤 다시 시도한다.
   - `exited early` : 스크립트가 로그 마지막 20줄을 출력한다. 원인을 고친 뒤 재실행한다.
   - `package.json not found - skipping` : 해당 워크스페이스가 아직 스캐폴딩되지 않았다. CLAUDE.md의 디렉터리 구조대로 먼저 생성한다.

3. 사용자에게 접속 URL을 알려준다.
   - 클라이언트: http://localhost:5173
   - 서버: http://localhost:3101
   - **다른 기기·친구**: 출력의 `Public : https://….trycloudflare.com` 주소. 터널을 다시 띄울 때마다 주소가 바뀐다(`/dev` 를 다시 실행해도 터널이 떠 있으면 같은 주소, 주소는 `.dev/tunnel-url.txt`). 온라인 방 초대 링크는 이 공개 주소로 연 화면에서 복사해야 다른 기기에서 열린다.
   - `Public : (none)` 이면 `.dev/tunnel.err.log` 를 본다. 주소가 나온 직후 몇 초는 접속이 안 될 수 있다(DNS 전파).
   - 공개 주소는 아는 사람 누구나 열 수 있다. 다 쓰면 `/dev-stop` 으로 터널까지 끈다.

## 로그 확인

```
tail -n 50 .dev/server.log
tail -n 50 .dev/client.log
```

## 주의

- `npm run dev`를 Bash 툴에서 직접 실행하지 않는다. 터미널이 블로킹된다.
- 코드 변경 후 재시작이 필요하면 `/dev-stop` → `/dev` 순으로 실행한다. (Vite, tsx watch 모두 핫리로드되므로 보통은 재시작 불필요)
- 의존성이 없으면 스크립트가 루트에서 `npm install`, `ai/.venv` 에 `pip install` 을 자동 실행한다. `ai/requirements.txt` 가 바뀌면 다음 `/dev` 때 다시 설치된다.
