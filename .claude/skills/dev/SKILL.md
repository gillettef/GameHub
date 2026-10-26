---
name: dev
description: 로컬 테스트용 개발 서버를 띄운다 — vite 개발 서버(5180, 같은 Wi-Fi 휴대폰 접속용 --host)와 온라인 대전 서버(8091)를 백그라운드로 실행하고 접속 주소를 알려 준다. "로컬에서 띄워 줘/테스트해 볼게/dev" 요청 시 사용. 종료는 dev-stop 스킬.
---

# 로컬 개발 서버 실행

AI 대전·핫시트는 vite 만으로 되지만, 온라인 대전까지 확인할 수 있게 **둘 다** 띄운다 (vite 가 `/ws` 를 8091 로 프록시).

## 1. 이미 떠 있는지 확인
```powershell
Get-NetTCPConnection -LocalPort 5180,8091 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess
```
- 둘 다 떠 있으면 새로 띄우지 말고 3번 주소만 알려 준다.
- 하나만 떠 있거나 다른 프로그램이 포트를 잡고 있으면 `dev-stop` 스킬 절차(스크립트)로 정리한 뒤 진행한다.

## 2. 백그라운드 실행
Bash/PowerShell 도구의 `run_in_background: true` 로 **각각 따로** 실행한다 (작업 폴더는 프로젝트 루트).
```
npm run server
npm run dev -- --host
```
- 포트는 `vite.config.ts` 에 5180 고정(strictPort). 5173 은 다른 프로젝트(Eleven·Rootbound 등)가 쓰므로 바꾸지 않는다.
- 첫 실행이고 `node_modules` 가 없으면 먼저 `npm install`.
- 몇 초 뒤 두 포트가 Listen 상태인지 1번 명령으로 확인한다. 안 떠 있으면 백그라운드 출력에서 오류를 읽어 보고한다.

## 3. 접속 주소 안내
- PC: `http://localhost:5180`
- 휴대폰(같은 Wi-Fi): vite 출력의 `Network:` 주소 (예: `http://192.168.x.x:5180`). 출력이 안 보이면
  ```powershell
  Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq 'Dhcp' } | Select-Object IPAddress, InterfaceAlias
  ```
- 온라인 대전은 여러 기기(또는 PC 브라우저 창 여러 개)에서 같은 주소로 접속해 방 코드로 들어가면 된다.
- 다른 네트워크(LTE)에서 접속해야 하면 대신 `npm run share` (빌드본 + Cloudflare 임시 주소)를 안내한다.
- 끝낼 때는 `/dev-stop` 이라고 알려 준다.
