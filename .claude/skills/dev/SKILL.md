---
name: dev
description: 개발 서버(프론트엔드 Vite, 백엔드가 있으면 백엔드도)를 현재 터미널 백그라운드로 실행하고 접속 주소를 알려 준다. 사용자가 개발 서버를 켜 달라거나, 화면을 직접 보며 확인하려 할 때 사용한다. 종료는 /dev-stop.
---

# 개발 서버 실행 (백그라운드)

포트는 고정한다. `/dev-stop`이 포트로 프로세스를 찾아 끄기 때문이다.

| 서버 | 명령 | 포트 |
|---|---|---|
| 프론트엔드 | `npm run dev -- --port 5173 --strictPort` | 5173 |
| 백엔드 | `npm run dev:server` (환경 변수 `PORT=8787`) | 8787 |

> 백엔드는 로드맵 8단계(온라인 멀티플레이)에서 생긴다. `package.json`에 `dev:server` 스크립트가 없으면 백엔드는 건너뛰고 "백엔드 없음"이라고 알린다. 백엔드를 추가할 때는 `dev:server` 스크립트가 `PORT` 환경 변수(기본 8787)를 쓰도록 만든다.

## 1. 이미 실행 중인지 확인

```bash
netstat -ano | grep -E ':(5173|8787) .*LISTENING'
```

- 이미 듣고 있는 포트의 서버는 다시 켜지 않고, 주소만 알려 준다.

## 2. 실행

Bash 도구의 `run_in_background: true`로 서버마다 따로 실행한다. 프로젝트 루트에서 실행한다.

- 프론트엔드: `npm run dev -- --port 5173 --strictPort`
- 백엔드(`dev:server`가 있을 때만): `PORT=8787 npm run dev:server`

백그라운드 작업 ID는 이 세션의 `/dev-stop`에서 쓸 수 있도록 기억해 둔다.

## 3. 준비 확인

Monitor 도구(지연 로드 도구라 먼저 ToolSearch로 불러온다)나 짧은 until 반복으로 포트가 열릴 때까지 기다린다. 최대 30초.

```bash
for i in $(seq 1 30); do netstat -ano | grep -q ':5173 .*LISTENING' && break; sleep 1; done
```

- 30초 안에 안 열리면 그 작업의 출력을 확인해 원인(포트 충돌, 의존성 누락 등)을 알린다. `--strictPort`라서 5173을 다른 프로그램이 쓰고 있으면 실패한다. 그 프로그램을 임의로 끄지 말고 사용자에게 알린다.

## 4. 보고

- 로컬: http://localhost:5173
- 휴대폰 테스트용 같은 와이파이 주소: Vite 출력의 `Network:` 줄 (`--host`로 실행됨)
- 백엔드: http://localhost:8787 또는 "백엔드 없음"
- 끌 때는 `/dev-stop`
