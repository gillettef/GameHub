---
name: dev
description: Neoterra 로컬 개발 서버를 띄운다 — Vite(25358, --host, 온라인 방 서버 /ws 포함)를 백그라운드로 실행하고, Cloudflare 퀵 터널까지 열어 다른 네트워크 친구용 공개 주소(https://….trycloudflare.com)와 PC·휴대폰 주소를 알려 준다. "서버 켜 줘/로컬에서 띄워 줘/dev" 요청 시 사용. 터널 없이 띄우라고 하면 4번을 건너뛴다. 종료는 /dev-stop.
---

# /dev — 로컬 개발 서버 실행

`npm run dev` 하나로 화면과 온라인 방 서버(`/ws`, 공통 `@gamehub/config/vite` 가 `server/app.ts` 를 붙인다)가 함께 뜬다.

## 1. 이미 떠 있는지 확인
```powershell
Get-NetTCPConnection -LocalPort 25358 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess
```
- 떠 있으면 새로 띄우지 말고 3번 주소만 알려 준다.
- 다른 프로그램이 잡고 있으면 `/dev-stop` 절차로 정리한 뒤 진행한다.

## 2. 백그라운드 실행
도구의 `run_in_background: true` 로 실행한다(작업 폴더는 `games/neoterra/`).
```
npm run dev
```
- 포트는 `vite.config.ts` 에서 25358 고정(`strictPort`). 운영은 GameHub 허브 안(`/neoterra/`)에서 돈다. 다른 프로젝트 포트(CLAUDE.md 필수 규칙 6)는 건드리지 않는다.
- 설치가 안 돼 있으면 GameHub 루트(`...\personal\GameHub` 표기 경로)에서 `npm install`.
- 몇 초 뒤 1번 명령으로 포트가 Listen 인지 확인한다. 안 떴으면 백그라운드 출력의 오류를 보고한다.

## 3. 접속 주소 안내
- PC: `http://localhost:25358`
- 휴대폰(같은 Wi-Fi): Vite 출력의 `Network:` 주소. 안 보이면
  ```powershell
  Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq 'Dhcp' } | Select-Object IPAddress, InterfaceAlias
  ```
- 온라인 대전은 여러 기기(또는 브라우저 창 여러 개)에서 같은 주소로 접속해 방 코드로 들어간다.

## 4. 다른 네트워크 친구와 하기 (Cloudflare 터널) — 기본으로 연다
3번 뒤에 이어서 항상 연다(“터널 없이/로컬만” 이라고 하면 건너뜀). 계정·도메인 없이 되는 **퀵 터널**을 쓴다.
- 터널은 **Vite(25358)만** 연다. `/ws` 도 같은 포트라 따로 열 필요 없다(`vite.config.ts` 의 `allowedHosts` 가 `.trycloudflare.com` 을 허용).
- `cloudflared` 설치 확인: `Get-Command cloudflared -ErrorAction SilentlyContinue`. 없으면 `winget install --id Cloudflare.cloudflared` 를 사용자에게 권한 확인 후 설치한다.
- 이미 터널이 떠 있는지 확인: 명령줄에 `localhost:25358` 이 있는 `cloudflared` 만 이 프로젝트 터널이다(`Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Select-Object ProcessId, CommandLine`). 있으면 새로 띄우지 말고 기존 주소를 쓴다(주소는 아래 로그 파일에서 찾는다). 다른 포트(예: 8094)를 가리키는 `cloudflared` 는 다른 용도이니 건드리지 않는다.
- 도구의 `run_in_background: true` 로 실행하고 출력은 로그 파일로 받는다(주소는 실행할 때마다 바뀐다).
  ```powershell
  cloudflared tunnel --url http://localhost:25358 --no-autoupdate 2>&1 | Tee-Object -FilePath $env:TEMP\neoterra-tunnel.log
  ```
- 몇 초 뒤 로그에서 주소를 뽑는다.
  ```powershell
  Select-String -Path $env:TEMP\neoterra-tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1 | ForEach-Object { $_.Matches[0].Value }
  ```
- 사용자에게 알린다: 공개 주소(`https://….trycloudflare.com`), 초대 코드 방식은 그대로(`?room=CODE` 를 같은 주소 뒤에 붙여 공유). 주소를 아는 사람은 누구나 들어올 수 있고, 터널을 끄면 주소가 사라진다.
- 터널 경유는 지연이 있어 로컬보다 느릴 수 있다. 개발 서버(HMR) 그대로 노출되므로 **친구와 하는 동안에만** 켜 둔다.
- 끝낼 때는 `/dev-stop`(터널도 함께 종료).
