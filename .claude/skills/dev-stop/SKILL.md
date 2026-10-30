---
name: dev-stop
description: /dev 로 띄운 Neoterra 개발 서버(Vite 5190, 온라인 서버 8094)를 종료한다. "서버 꺼 줘/dev 종료/dev-stop" 요청 시 사용.
---

# /dev-stop — 개발 서버 종료

## 1. 대상 확인
```powershell
Get-NetTCPConnection -LocalPort 5190,8094 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess, @{n='Name';e={(Get-Process -Id $_.OwningProcess).ProcessName}}
```
- 아무것도 없으면 "실행 중인 개발 서버 없음"이라고 알리고 끝낸다.

## 2. 종료
- **5190·8094 를 Listen 하는 `node` 프로세스만** 끈다. 이름이 `node` 가 아니면 끄지 말고 사용자에게 무엇인지 알린다.
  ```powershell
  Get-NetTCPConnection -LocalPort 5190,8094 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force -Confirm:$false } }
  ```
- 이 세션에서 `run_in_background` 로 띄운 작업이 남아 있으면 함께 정리한다.
- **다른 프로젝트 포트(3001·3101·5173·5180·8080·8090~8093 등)를 쓰는 프로세스는 절대 종료하지 않는다.**

## 3. 확인
1번 명령을 다시 실행해 두 포트가 비었는지 보고한다.
