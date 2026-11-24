---
name: dev
description: 마법학교 게임 서버를 띄우고 Cloudflare 터널로 외부에 공개해, 다른 네트워크의 친구들이 접속할 수 있는 주소를 발급한다. 사용자가 "/dev", "서버 열어줘", "친구들이랑 테스트할 서버 실행"이라고 요청할 때 사용한다.
---

# dev

다른 네트워크(집 밖/다른 Wi-Fi)의 친구들이 접속할 수 있도록 로컬 서버를 외부에 공개한다.

## 절차

1. PowerShell로 `.claude/skills/dev/start.ps1`을 실행한다 (`powershell -ExecutionPolicy Bypass -File .claude/skills/dev/start.ps1`, 빌드·터널 대기로 1~2분 걸리고, 자식 프로세스가 출력 파이프를 물고 있어 명령이 끝나지 않을 수 있으므로 `run_in_background`로 실행한 뒤 출력 또는 `.dev/url.txt`로 주소를 확인한다).
   - `cloudflared`가 PATH에 없으면 공식 릴리스 exe를 `.dev/bin/`에 다운로드, 의존성 없으면 `npm install`, `client` 빌드, 서버(`server`, 포트 8080) 백그라운드 실행, `cloudflared` 퀵 터널(계정 불필요) 실행까지 자동 처리한다.
   - 상태/로그는 `.dev/`(gitignore)에 저장된다: `pids.json`, `url.txt`, `server.log`, `tunnel.log`.
2. 출력된 `https://xxxx.trycloudflare.com` 주소를 사용자에게 알려준다. 친구들은 이 주소로 접속 후 방 코드로 입장한다 (HTTPS/WSS는 터널이 제공하며 클라이언트가 자동으로 wss를 선택한다).
3. 실패하면 `.dev/*.log`를 확인해 원인을 알린다.

## 유의사항

- 주소는 실행할 때마다 바뀌고, 서버를 끄면 진행 중인 게임도 사라진다 (메모리 상태).
- 종료는 `/dev-stop`.
- 서버 코드/클라이언트를 수정했다면 `/dev-stop` 후 다시 `/dev`를 실행해야 반영된다.
