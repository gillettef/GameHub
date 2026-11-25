---
name: dev-stop
description: /dev 로 띄운 Neoterra 개발 서버(Vite 25358, 온라인 방 서버 포함)와 Cloudflare 터널(cloudflared)을 종료한다. "서버 꺼 줘/dev 종료/dev-stop" 요청 시 사용.
---

# /dev-stop — 개발 서버 종료

## 1. 대상 확인
```powershell
Get-NetTCPConnection -LocalPort 25358 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess, @{n='Name';e={(Get-Process -Id $_.OwningProcess).ProcessName}}
```
- 아무것도 없으면 "실행 중인 개발 서버 없음"이라고 알리고 끝낸다.

## 2. 종료
- **25358 을 Listen 하는 `node` 프로세스만** 끈다. 이름이 `node` 가 아니면 끄지 말고 사용자에게 무엇인지 알린다.
  ```powershell
  Get-NetTCPConnection -LocalPort 25358 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force -Confirm:$false } }
  ```
- **Cloudflare 터널**: 이 프로젝트가 띄운 `cloudflared`(명령줄에 `localhost:25358` 이 있는 것)만 끈다. 다른 터널은 건드리지 않는다.
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match 'localhost:25358' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
  Remove-Item $env:TEMP\neoterra-tunnel.log -ErrorAction SilentlyContinue
  ```
- 이 세션에서 `run_in_background` 로 띄운 작업이 남아 있으면 함께 정리한다.
- **다른 프로젝트 포트(3001·3101·5173·5180·8080·8090~8093 등)를 쓰는 프로세스는 절대 종료하지 않는다.**

## 3. 확인
1번 명령을 다시 실행해 포트가 비었는지, 터널(`Get-Process cloudflared`)이 없는지 보고한다.
