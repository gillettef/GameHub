# GameHub — 보드게임 통합 모노레포

한 URL(현재 `http://54.116.67.196/`)에서 게임을 고르고, 봇 또는 다른 플레이어와 대전하는 서비스.
2026-11-24 각 게임의 개별 저장소(`gillettef/<Game>`)를 `git subtree`로 이력째 합쳐 만들었다.

## 구조

- `hub/` — 허브: 로비(`public/`) + `/<slug>/...` 리버스 프록시(`server.mjs`, HTTP·WebSocket). 게임 목록·포트는 `hub/games.json`.
- `games/<slug>/` — 게임별 프로젝트. 각자의 `CLAUDE.md`가 그 게임의 규칙·코드 규칙이다. 게임 안에서 작업할 때는 그 문서를 먼저 따른다.
- `.github/workflows/` — `ci-<slug>.yml`(경로 필터), `deploy-<slug>.yml`(workflow_call), `deploy.yml`(오케스트레이터), `deploy-hub.yml`.

## 운영 구조 (1단계: 하이브리드)

- 공용 EC2(t4g.nano, 서울, Amazon Linux, `ec2-user`). 허브는 systemd `gamehub`(:80), 게임은 기존대로 각자 systemd 서비스·포트.
- 허브는 `/<slug>/` 접두어를 떼고 게임에 넘긴다. 방식은 `hub/games.json`의 게임별 `mode`:
  `proxy`(기본, `127.0.0.1:<port>`로 프록시) 또는 `inproc`(허브 프로세스가 `~/<slug>/scripts/aws/hub-entry.mjs`를 불러 직접 실행, 2단계 2a).
  inproc 모듈 계약은 `hub/server.mjs` 머리 주석. 운영 점검: 서버 안에서 `curl 127.0.0.1/healthz/status`(메모리·게임별 실행 방식). 그래서 **게임 클라이언트는 절대경로를 쓰면 안 된다**:
  에셋·`fetch`·WebSocket URL·공유 링크는 현재 페이지 디렉터리 기준 상대경로로 만든다. 루트(IP:포트) 직접 접속에서도 동작해야 한다.
- 모든 게임이 같은 origin을 쓰므로 localStorage·cookie 키는 `<slug>:` 접두어를 붙인다. service worker scope는 게임 디렉터리 안으로 제한한다.
- 서버 메모리가 빠듯하다(0.4GB, 스왑 사용 중). 2단계에서 공통 방·봇 SDK와 단일 프로세스로 합친다(`docs/phase2-design.md`).
  inproc로 옮긴 게임: 15개 전부(smilepark, crease, lightcone, lastgrain, eleven, doubleagent, proxymind, retrocause, hearsay, sightline, tesseract, election, neoterra, magicacademy, rootbound). rootbound 는 Python AI 를 TS 로 옮겨 사이드카 없이 서버 번들 하나로 돈다. 옮긴 게임의 `deploy-remote.sh`는 자기 systemd 유닛을 끄고 `gamehub`를 재시작한다.

## 브랜치·배포

- 일상 작업은 `dev`에 커밋·푸시(CI만). `main`에는 직접 푸시하지 않고 사용자가 요청할 때만 `dev` → `main` PR. 병합이 곧 운영 배포다.
- `deploy.yml`이 바뀐 게임·허브만 골라 **순서대로** 배포한다. 수동: Actions → Deploy → `games`에 `all` 또는 `tesseract eleven`.
- 개별 원본 저장소(`gillettef/<Game>` 15개)는 2026-11-25 삭제했다(브랜치 끝 커밋이 모두 이 저장소 이력에 있음을 확인한 뒤). 작업·운영 배포는 이 저장소에서만 한다.

## 게임 추가

1. `games/<slug>/`에 넣고 상대경로 규칙을 지킨다. 2. `hub/games.json`에 slug·포트·인원 추가.
3. `.github/workflows/ci-<slug>.yml`, `deploy-<slug>.yml`(workflow_call) 작성, `deploy.yml` 체인 끝에 잡 추가.
