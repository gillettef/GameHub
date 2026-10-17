---
name: dev
description: 로컬 테스트용으로 백엔드(server, 3101), 프론트엔드(client, 5173), Python AI 서비스(ai, 8000)를 현재 터미널의 백그라운드에서 함께 실행한다. "서버 켜줘", "dev 서버 실행", "로컬에서 띄워줘", "같은 와이파이 휴대폰으로 해 보고 싶어" 요청 시 사용. 같은 네트워크의 다른 기기도 http://<이 PC IP>:5173 으로 접속할 수 있다. 종료는 /dev-stop.
---

# /dev — 백엔드·프론트엔드·AI 백그라운드 실행

서버(`server/`, 3101), 클라이언트(`client/`, 5173), Python AI 서비스(`ai/`, 8000)를 분리된 백그라운드 프로세스로 띄운다.
프로세스는 터미널을 블로킹하지 않으며, PID는 `.dev/*.pid`, 로그는 `.dev/*.log`에 기록된다.
AI 서비스는 `ai/.venv` 가 없으면 자동으로 만들고 `ai/requirements.txt` 를 설치한다 (이 PC의 Python 3.11은 PATH에 없어 스크립트가 절대 경로로 찾는다).

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
   - `package.json not found` / `requirements.txt not found - skipping` : 해당 워크스페이스가 아직 스캐폴딩되지 않았다. CLAUDE.md의 디렉터리 구조대로 먼저 생성한다.
   - `Python not found` : Python 3.11+ 설치 경로를 `scripts/dev.ps1` 의 `$pythonCandidates` 에 추가한다.

3. 사용자에게 접속 URL을 알려준다.
   - 클라이언트: http://localhost:5173
   - 서버: http://localhost:3101
   - AI: http://localhost:8000
   - **같은 네트워크의 다른 기기**(휴대폰·다른 PC): 출력의 `LAN    : http://<IP>:5173` 주소. 여러 줄이면 다른 기기와 같은 와이파이에 붙은 어댑터의 주소를 쓴다. 온라인 방 초대 링크도 이 주소로 연 화면에서 복사해야 한다(localhost 링크는 다른 기기에서 열리지 않는다).

4. 다른 기기에서 접속이 안 될 때
   - 출력에 `Firewall: no inbound rule for TCP 5173` 이 있으면 Windows 방화벽이 막는다. 사용자에게 **관리자 PowerShell**에서 출력된 `New-NetFirewallRule ...` 명령을 한 번 실행하라고 안내한다(Claude 는 관리자 권한이 없어 직접 못 한다). 규칙은 개인(Private) 네트워크에만 연다.
   - 출력에 `Network: '...' is Public` 이 있으면, 즉 와이파이가 **공용(Public) 네트워크**로 잡혀 있으면 위 규칙이 적용되지 않는다. Windows 설정 → 네트워크 및 인터넷 → 해당 와이파이 → "개인 네트워크"로 바꾸라고 안내한다.
   - 게스트 와이파이처럼 기기끼리 통신을 막는 네트워크(AP 격리)에서는 안 된다. 그때는 휴대폰 핫스팟에 PC 와 기기를 함께 붙인다.
   - 열어야 하는 포트는 Vite(5173)뿐이다. 서버(3101)·AI(8000)는 이 PC 안에서 Vite 프록시가 부른다.

## 로그 확인

```
tail -n 50 .dev/server.log
tail -n 50 .dev/client.log
tail -n 50 .dev/ai.log
tail -n 50 .dev/ai.err.log      # uvicorn은 stderr에 로그를 쓴다
```

## 주의

- `npm run dev`를 Bash 툴에서 직접 실행하지 않는다. 터미널이 블로킹된다.
- 코드 변경 후 재시작이 필요하면 `/dev-stop` → `/dev` 순으로 실행한다. (Vite, tsx/nodemon, uvicorn `--reload` 모두 핫리로드되므로 보통은 재시작 불필요)
- 의존성이 없으면 스크립트가 루트에서 `npm install`, `ai/.venv` 에 `pip install` 을 자동 실행한다. `ai/requirements.txt` 가 바뀌면 다음 `/dev` 때 다시 설치된다.
