---
name: dev
description: 로컬 테스트용 개발 서버를 띄운다 — vite 개발 서버 하나가 화면과 온라인 대전 서버(server/app.ts 의 /ws)를 함께 띄운다. "로컬에서 띄워 줘/테스트해 볼게/dev" 요청 시 사용.
---

# 로컬 개발 서버 실행

`games/doubleagent` 에서 `npm run dev` 를 `run_in_background: true` 로 실행한다(`vite --host`). 공통 Vite 설정(`@gamehub/config/vite`)이
같은 포트에 온라인 대전 WebSocket(`/ws`)과 `/health` 를 붙이므로 서버를 따로 띄우지 않는다.

- 의존성은 GameHub 루트에서 `npm install` 한 번(루트 npm workspaces). 이 PC 에서는 `...\personal\GameHub` 표기 경로에서 실행한다.
- 출력의 `Local:`/`Network:` 주소를 알려 준다(포트는 vite 기본값, 이미 쓰이면 다음 번호). 같은 Wi-Fi 휴대폰은 `Network:` 주소.
- 운영과 같은 방식(허브 안, `/doubleagent/`)으로 보려면 `npm run build && npm start` → `http://localhost:8080/doubleagent/`.
- 끝낼 때는 그 백그라운드 작업을 멈춘다.
