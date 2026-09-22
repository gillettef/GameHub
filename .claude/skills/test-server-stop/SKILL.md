---
name: test-server-stop
description: /test-server 로 띄운 테스트 서버(Node 3301, Python AI 8002, Cloudflare 터널)를 모두 종료한다. "테스트 서버 꺼줘", "스테이징 종료", "test 내려줘" 요청 시 사용.
---

# /test-server-stop — 테스트 서버 종료

`.dev/test-tunnel.pid`, `.dev/test-server.pid`, `.dev/test-ai.pid` 의 프로세스 트리를 종료하고 pid 파일과 `.dev/test-url.txt` 를 지운다.
포트 3301/8002 폴백은 **이 프로젝트에서 띄운 프로세스만** 종료한다. 무관한 프로세스(포트 3001 의 Eleven 등)는 보고만 하고 남긴다. 운영 서버(3201/8001)는 건드리지 않는다.

## 실행 절차

1. Bash 툴로 포그라운드 실행한다.

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve-stop.ps1 -Env test
   ```

2. 출력을 확인한다.
   - `stopped PID ...` : 정상 종료
   - `no pid file` / `not running` : 이미 꺼져 있음
   - `NOT from this project, left running` : 다른 앱이 그 포트를 쓴다. 건드리지 않는다.
