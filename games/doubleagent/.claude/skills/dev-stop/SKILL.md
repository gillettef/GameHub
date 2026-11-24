---
name: dev-stop
description: dev 스킬로 띄운 로컬 개발 서버(vite 5180, 온라인 대전 서버 8091)를 종료한다. "서버 꺼 줘/dev 종료/dev-stop" 요청 시 사용.
---

# 로컬 개발 서버 종료

1. 이번 세션에서 백그라운드로 띄운 작업이 있으면 먼저 `TaskStop` 으로 멈춘다 (`npm run dev`, `npm run server`).
2. 그다음 항상 정리 스크립트를 실행한다 — 다른 세션·터미널에서 띄웠거나 자식 node 프로세스가 남은 경우까지 처리한다.
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-stop.ps1
   ```
   - 이 프로젝트 폴더에서 실행된 vite·tsx node 프로세스만 트리째 끈다. 다른 프로그램이 포트를 잡고 있으면 끄지 않고 PID·명령줄만 출력한다.
   - 마지막 줄이 `포트 5180·8091 모두 해제됨.` 또는 `실행 중인 개발 서버가 없습니다.` 이면 끝.
   - `아직 열려 있는 포트` 가 나오면 해당 PID 의 프로세스 이름·명령줄을 확인해 보고하고, 사용자에게 알리고 임의로 끄지 않는다.
3. 무엇을 종료했는지 짧게 알린다.
