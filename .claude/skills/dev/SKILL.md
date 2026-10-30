---
name: dev
description: Neoterra 로컬 개발 서버를 띄운다 — Vite(5190, --host)와 온라인 대전 서버(8094)를 백그라운드로 실행하고 PC·휴대폰 접속 주소를 알려 준다. "서버 켜 줘/로컬에서 띄워 줘/dev" 요청 시 사용. 종료는 /dev-stop.
---

# /dev — 로컬 개발 서버 실행

AI 대전은 Vite 만으로 되지만, 온라인 대전까지 확인할 수 있게 **둘 다** 띄운다(Vite 가 `/ws` 를 8094 로 프록시).

## 1. 이미 떠 있는지 확인
```powershell
Get-NetTCPConnection -LocalPort 5190,8094 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess
```
- 둘 다 떠 있으면 새로 띄우지 말고 3번 주소만 알려 준다.
- 하나만 떠 있거나 다른 프로그램이 잡고 있으면 `/dev-stop` 절차로 정리한 뒤 진행한다.
- `package.json` 이 없으면 아직 스캐폴딩 전이다. 사용자에게 알리고 CLAUDE.md "디렉터리 구조"·"명령어" 대로 만들지 묻는다.

## 2. 백그라운드 실행
도구의 `run_in_background: true` 로 **각각 따로** 실행한다(작업 폴더는 `Neoterra/`).
```
npm run server
npm run dev -- --host
```
- 포트는 `vite.config.ts` 에서 5190 고정(`strictPort`), 서버는 `PORT` 기본 8094. 다른 프로젝트 포트(CLAUDE.md 필수 규칙 6)는 건드리지 않는다.
- `node_modules` 가 없으면 먼저 `npm install`.
- 몇 초 뒤 1번 명령으로 두 포트가 Listen 인지 확인한다. 안 떴으면 백그라운드 출력의 오류를 보고한다.

## 3. 접속 주소 안내
- PC: `http://localhost:5190`
- 휴대폰(같은 Wi-Fi): Vite 출력의 `Network:` 주소. 안 보이면
  ```powershell
  Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq 'Dhcp' } | Select-Object IPAddress, InterfaceAlias
  ```
- 온라인 대전은 여러 기기(또는 브라우저 창 여러 개)에서 같은 주소로 접속해 방 코드로 들어간다.
- 끝낼 때는 `/dev-stop`.
