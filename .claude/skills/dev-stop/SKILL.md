---
name: dev-stop
description: /dev 스킬로 띄운 마법학교 게임 서버와 Cloudflare 터널을 종료한다. 사용자가 "/dev-stop", "서버 꺼줘", "터널 종료"라고 요청할 때 사용한다.
---

# dev-stop

1. PowerShell로 `powershell -ExecutionPolicy Bypass -File .claude/skills/dev-stop/stop.ps1`을 실행한다. `.dev/pids.json`에 기록된 서버·터널 프로세스 트리를 종료하고 상태 파일을 정리한다.
2. 결과("종료했습니다" 또는 "실행 중인 서버가 없습니다")를 사용자에게 짧게 알린다.
