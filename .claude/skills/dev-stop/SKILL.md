---
name: dev-stop
description: /dev 로 띄운 백엔드·프론트엔드·Python AI 백그라운드 프로세스를 모두 종료한다. "서버 꺼줘", "dev 서버 종료", "포트 3001/5173/8000 정리" 요청 시 사용.
---

# /dev-stop — 백그라운드 개발 서버 종료

`.dev/server.pid`, `.dev/client.pid`, `.dev/ai.pid`에 기록된 프로세스 트리를 종료한다. 그래도 3001/5173/8000 포트를 점유한 프로세스가 남아 있으면, 이 프로젝트 경로에서 실행된 node/python 프로세스에 한해 함께 종료한다.

## 실행 절차

1. Bash 툴로 실행한다.

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-stop.ps1
   ```

2. 출력 메시지로 결과를 확인하고 사용자에게 간단히 보고한다.
   - `stopped PID ...` : 정상 종료
   - `no pid file` / `not running` : 이미 종료된 상태
   - `in use by PID ... - NOT from this project, left running` : 3001/5173/8000 포트를 이 프로젝트와 무관한 프로세스가 쓰고 있다. **절대 임의로 종료하지 말고** 사용자에게 알린다.

3. 확인이 필요하면 포트가 비었는지 검사한다.

   ```
   powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001,5173,8000 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess"
   ```

   출력이 비어 있으면 정상 종료된 것이다.
