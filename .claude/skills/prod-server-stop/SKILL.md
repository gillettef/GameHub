---
name: prod-server-stop
description: /prod-server 로 띄운 운영 서버(Node 3201, Python AI 8001, Cloudflare 터널)를 모두 종료한다. "운영 서버 꺼줘", "배포 서버 종료", "prod 내려줘" 요청 시 사용.
---

# /prod-server-stop — 운영 서버 종료

`.dev/prod-tunnel.pid`, `.dev/prod-server.pid`, `.dev/prod-ai.pid` 의 프로세스 트리를 종료하고 pid 파일과 `.dev/prod-url.txt` 를 지운다.
포트 3201/8001 폴백은 **이 프로젝트에서 띄운 프로세스만** 종료한다. 무관한 프로세스(포트 3001 의 Eleven 등)는 보고만 하고 남긴다.

## 실행 절차

1. Bash 툴로 포그라운드 실행한다.

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve-stop.ps1 -Env prod
   ```

2. 출력을 확인한다.
   - `stopped PID ...` : 정상 종료
   - `no pid file` / `not running` : 이미 꺼져 있음
   - `NOT from this project, left running` : 다른 앱이 그 포트를 쓴다. 건드리지 않는다.

3. 접속 중이던 친구들에게 서버가 내려갔음을 알려야 한다고 사용자에게 말한다. 다시 켜면 공개 주소가 바뀐다.
