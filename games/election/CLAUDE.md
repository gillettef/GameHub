# 유세 대작전 (대통령 선거 만칼라)

두 후보(🔵 파랑 / 🔴 빨강)가 6개 권역을 도는 "유세 버스"로 지지자 토큰을 뿌리는 만칼라형 2인 보드게임. 웹 모바일(세로 화면 우선) 게임으로 만든다.

## 현재 상태

- `docs/election-mancala-standalone.html` — **동작하는 프로토타입이자 규칙의 기준 명세**. 단일 HTML, 바닐라 JS, 축약된 변수명.
  - 직접 수정하지 않는다. 규칙이 애매하면 이 파일의 동작이 정답이다. 단, 턴당 투입 개수(프로토타입 1~2개 → 본 구현 1개)는 의도적으로 다르다.
  - 규칙을 의도적으로 바꿀 때는 사용자에게 먼저 확인하고, `.claude/skills/game-rules/SKILL.md`를 함께 갱신한다.
- 본 구현(Vite + TypeScript)이 아래 구조로 동작한다: AI 대결, 온라인 대결, 이어하기(AI 대결만 localStorage), PWA. 한 기기 2인(핫시트) 모드는 없앴다.
- 온라인 대결은 Node 서버(`server/index.ts`, `ws`) 하나가 정적 사이트(`dist/`)·`/api/room/:code`(WebSocket)·`/health`를 같은 포트로 맡는다. **DB 없음** — 방 상태는 서버 메모리에만 있어 재시작하면 진행 중인 방이 사라진다. (2026-11-02 Cloudflare Workers + Durable Objects 에서 옮김)
  - 서버가 상태의 기준: 방마다 `src/core`의 `applyAction`으로 검증·적용하고 상대에게 액션만 전달한다. 클라이언트는 낙관적으로 적용하고, 거부되면 `state` 메시지로 되돌린다. 프로토콜은 `src/net/protocol.ts`(서버·클라이언트 공용).
  - 판단 로직은 `server/room.ts`(순수), 방 보관·소켓 전달은 `server/hub.ts`(ws 비의존, Vitest로 테스트), HTTP·WebSocket 연결은 `server/index.ts`. 방장 자리(🔵 선공 seat 0 / 🔴 후공 seat 1)는 방을 만들 때 서버가 무작위로 정하고 참가자는 남은 자리. AI 대결도 판마다 내 색을 무작위로 정한다(저장에 `aiPlayer` 포함). 자리는 기기별 `clientId`(localStorage)로 기억해 재접속 시 되찾는다. 접속자 없이 24시간 지난 방은 주기적으로 지운다.
  - 초대 링크는 `?room=CODE`. 프런트를 다른 곳에 호스팅하면 `VITE_API_ORIGIN`으로 API 주소를 지정한다.
  - 서버는 빌드 때 esbuild 로 `server-dist/server.cjs` 한 파일(ws 포함)로 번들한다(`scripts/build-server.mjs`). 운영 서버에서 `npm install` 하지 않는다.
- 패리티 테스트(`tests/parity.test.ts`)는 프로토타입 HTML의 `<script>`에서 규칙·AI 구간(`/* ---------- 흐름` 주석 앞까지)을 테스트 시점에 잘라 평가한다. 프로토타입의 그 주석이나 함수 이름이 바뀌면 `tests/fixtures/prototype.ts`도 고친다.
- `core/rules.ts`의 `resolveAction`은 연출 박자(Step[])를, `applyAction`은 최종 상태를 돌려준다(둘 다 자동 하차·턴 종료 포함). 박자 사이 지연은 `game/controller.ts`의 `DELAYS`.
- AI는 데스크톱 기준 한 수 평균 ~5ms, 최대 ~30ms라 메인 스레드에서 돈다(Web Worker 미사용).
- 아이콘 PNG는 `node scripts/make-icons.mjs`로 생성(`public/icon.svg`와 같은 도안).
- 비주얼 방향(2026-11-02): "개표방송 × 인쇄 보드게임". 라이트는 크라프트지(`--bg #f2ede2`), 다크는 개표방송 네이비(`--bg #0e1320`). 제목·점수는 Google Fonts `Black Han Sans`(`.disp`, 오프라인이면 시스템 글꼴로 대체), 본문은 시스템 글꼴. 기표 도장(卜) 로고, 선거인단 35칸 줄다리기 바, 턴 단계 칩, 속보 티커, 개표 결과 시트. UI 아이콘은 `src/ui/icons.ts`의 선 SVG(이모지 대신). 색 토큰은 `src/style.css` 맨 위.
- `public/sw.js`의 `CACHE`/`PRECACHE` 줄은 빌드 때 `vite.config.ts`의 `swManifest` 플러그인이 dist 전체 파일 목록과 내용 해시로 바꾼다. 그 두 줄의 형태(`const CACHE = …` / `const PRECACHE = …`, 한 줄)를 유지할 것.

## 기술 스택

- Vite + TypeScript (strict), UI 프레임워크 없음 — DOM + SVG 직접 렌더링
- 테스트: Vitest
- 배포 형태: 정적 사이트 + PWA (manifest, service worker로 오프라인 플레이)
- 온라인: Node 22 + `ws`(개발 의존성, 서버 번들에 포함). 클라이언트는 브라우저 WebSocket. 서버 번들 esbuild, 개발 실행 tsx.
- 런타임 의존성은 최소화한다(현재 0개). 새 의존성 추가 전 사용자에게 확인.
- 배포: AWS EC2 게임 공용 서버(t4g.nano, 서울), systemd `election`, 포트 **8096**. 아래 "배포" 참고.

## 명령

```
npm run dev        # 개발 서버 (모바일 기기 확인 시 --host)
npm run dev:server # 온라인 대결용 로컬 서버 (tsx watch server/index.ts, 포트 38637 — Vite가 /api를 프록시)
npm run build      # typecheck && vite build && 서버 번들(server-dist/server.cjs)
npm run test       # vitest run
npm run typecheck  # tsc --noEmit (브라우저) && tsc --noEmit -p server (Node 서버)
npm start          # 빌드 결과 실행(dist + 서버). 운영은 systemd 가 PORT=8096 으로 실행
```

포트: 로컬 Vite 38617, 미리보기 38627, 서버 38637 / 운영 8096. 다른 프로젝트 포트(3001 Eleven, 3201 AstralTab, 8080 MagicAcademy, 8090 SmilePark, 8091 DoubleAgent, 8092 Tesseract, 8093 Beltbreaker, 8094 Neoterra, 8095 jandi-obsidian)를 점유한 프로세스는 절대 종료하지 않는다.

## Git·브랜치

- push 대상 repo: `https://github.com/gillettef/Election.git`. GitHub 계정은 **`gillettef`만** 쓴다(로컬 git 설정 `credential.https://github.com.username=gillettef` 를 지우거나 바꾸지 않는다).
- **일상 작업은 `dev` 브랜치에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. 상세는 `docs/environments.md`.

## 배포 (AWS) — 운영 중 (v0.1.0, 2026-11-02)

- **2026-11-24부터 운영은 GameHub 허브 안에서 실행된다**(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs` → `server-dist/app.cjs`(`server/app.ts`, `createApp`)). 접속은 `http://54.116.67.196/election/`. 배포하면 `deploy-remote.sh`가 예전 systemd `election` 서비스를 끄고 허브(`gamehub`)를 재시작한다 — 허브 안 다른 게임의 진행 중인 방도 함께 사라진다. `server/index.ts`(`server-dist/server.cjs`)는 로컬 단독 실행용으로 남는다. 아래의 포트·systemd 설명은 예전 단독 운영 기준이다.

- 다른 게임과 같은 EC2(t4g.nano, 서울) 1대를 공유한다. systemd `election`, 포트 8096, 경로 `~/election`, 주소 `http://54.116.67.196:8096`. `main` 병합 시 `.github/workflows/deploy-aws.yml` 이 `npm test` → `npm run build` 통과 후 배포한다(Neoterra·DoubleAgent 와 같은 방식: 러너 IP 를 SSH 22 에 임시 허용 → `ec2-user` 로 dist·server-dist·package.json·scripts/aws 업로드 → 서버 안 `scripts/aws/deploy-remote.sh` 가 systemd 설치·재시작·`/health` 확인 → 허용 제거).
- CI(`.github/workflows/ci.yml`)는 dev·main 푸시와 PR 마다 타입체크·테스트·빌드를 돌린다.
- 관리자 SSH 키·IP는 `../Rootbound/.dev/astraltab-key.pem`, `../Rootbound/.dev/aws-public-ip.txt` 를 공용으로 쓴다. 저장소 시크릿 값의 정본은 저장소 밖 `../../aws_config.md`. 서버 로그: `ssh -i ../Rootbound/.dev/astraltab-key.pem ec2-user@54.116.67.196 "sudo journalctl -u election -n 100"`.
- 운영은 HTTP(IP:포트)라 서비스 워커·PWA 설치·오프라인은 동작하지 않는다(브라우저가 HTTPS/localhost 에서만 등록). 게임·온라인 대결은 된다.

작업을 끝냈다고 말하기 전에 `npm run typecheck`와 `npm run test`를 통과시킨다.

## 아키텍처

```
src/
  core/      순수 게임 로직. DOM·타이머·Math.random 금지. 결정적.
    types.ts       GameState, Phase, Player, Action
    constants.ts   CAP=[8,7,6,6,4,4], 권역 이름, 초기 예비군 [10,11], 배치 토큰 4
    rules.ts       initialState, applyAction, legalActions, score, winner, isOver
    ai.ts          AI 의사결정 (rng 주입)
    rng.ts         Rng 타입, 시드 난수(mulberry32)
    validate.ts    외부에서 온 값의 GameState 검사
  game/      컨트롤러: 모드(ai | online), 턴 진행, 자동 하차 타이밍, AI 호출, 상대 수 재생 / storage.ts 저장·테마·clientId
  net/       protocol.ts(메시지·검사, 서버와 공용), online.ts(WebSocket 연결·자동 재접속)
  ui/        화면 렌더링(app, gameScreen, board), 입력 처리, 애니메이션
  main.ts
  style.css
public/      manifest, 아이콘, sw.js(서비스 워커)
server/      Node 서버: index.ts(HTTP·정적·WebSocket·/health), hub.ts(메모리 방·소켓 전달), room.ts(순수 방 로직), tsconfig.json(Node 타입)
tests/       Vitest (parity / rules / controller / validate / online / hub)
scripts/     make-icons.mjs, build-server.mjs(서버 번들), aws/(deploy-remote.sh, election.service)
.github/     workflows/ci.yml(검사), workflows/deploy-aws.yml(main → EC2 배포)
```

핵심 원칙:

- **상태 변경은 오직 `applyAction(state, action) → newState`** 로. 액션은 `place(hole)`, `endPlace`, `pick(hole)`, `drop(color)`, 셋업 단계의 `setup(hole)`. 버스 토큰이 한 색만 남았을 때의 자동 하차도 core가 처리(또는 `pendingAutoDrops`로 노출)하고, 애니메이션 지연은 game/ui 계층의 책임이다.
- `GameState`는 JSON 직렬화 가능해야 한다 (저장/복원, 향후 온라인 동기화). 클래스·Map·Set 사용 금지.
- 프로토타입의 `s.hl`(마지막 하차 위치) 같은 UI 전용 값은 core 상태에 넣지 않는다.
- 프로토타입은 상태를 제자리에서 변경(mutate)한다. 포팅할 때는 불변 업데이트로 바꾸되 결과는 동일해야 한다.
- AI는 무거울 수 있다(2수 전탐색). 메인 스레드를 막으면 Web Worker로 옮긴다. 저사양 모바일에서 한 수에 1초를 넘기지 않는 것이 목표.

## 규칙 요약

전체 명세는 `game-rules` 스킬 (`.claude/skills/game-rules/SKILL.md`). core를 건드리기 전에 반드시 읽는다.

- 권역 A~F 시계 방향 원형, 선거인단(=칸 수) 8/7/6/6/4/4, 합계 35
- 셋업: 각자 4개를 번갈아 배치 (🔵 선공). 예비군은 🔵 10 / 🔴 11
- 턴: ① 예비군 1개 투입 → ② 토큰 있는 권역 하나를 비워 버스에 태움 → ③ 다음 권역부터 포화 권역을 건너뛰며 1개씩 하차(색 순서는 플레이어 선택)
  - 투입은 프로토타입의 1~2개에서 **1개로 의도적으로 바꿨다**(2026-11-02, `MAX_PLACE_PER_TURN`). 근거·패리티 처리는 `game-rules` 스킬 참고.
- 포화 권역 4곳 이상 또는 예비군 전부 소진 → 선거일(종료)
- 권역 다수 색이 선거인단 획득, 동점은 맨 아래 토큰(⚑) 색. 총점 동점이면 남은 예비군 많은 쪽, 그래도 같으면 무승부

## 화면 용어 (UI 문구 기준)

코드·문서는 "토큰/셋업/하차/턴"을 써도 되지만, 플레이어에게 보이는 문구는 아래로 통일한다.

| 개념 | 화면 용어 | 쓰지 않음 |
|---|---|---|
| 토큰 | 지지자, 세는 단위 **명** (예비군도 명) | 토큰, 개 |
| 셋업 단계 | 사전 배치 | 시작, (단독) 배치 |
| 예비군 | 예비군 = 아직 보드에 놓지 않은 내 지지자 (단위 명) | 조직 |
| 단계 ①②③ | 예비군 투입 / 버스 출발 / 유세 순회 (칩은 투입·출발·유세로 줄여 씀) | 조직 투입 |
| 하차 | 내리기 | |
| 점수·선거인단 | **표** (`선거인단 8표`, `선거인단 35표`, `미확정 N표`). 권역의 선거인단 수 = 들어갈 수 있는 지지자 수(차면 포화) | 석, 단위 없는 숫자 |
| 턴 | 차례 | 턴 |
| 맨 아래 토큰 | 맨 먼저 놓인 지지자(⚑ 깃발) | 맨 아래 토큰 |
| 이긴 쪽 | ○○ 후보 당선 (나 기준 결과만 승리/패배) | ○○ 승리 |
| 비김 | 무승부 | 동률 |
| 종료 후 | 선거일 · 개표 완료 | 선거 종료 |
| 선공 결정 | 추첨 | 무작위 |

## 모바일 요구사항

- 최소 폭 360px에서 가로 스크롤 없이 전체 보드가 보일 것. 세로 모드 우선.
- 터치 타깃 최소 44×44px. hover에 의존하는 상호작용 금지.
- `viewport-fit=cover` + `env(safe-area-inset-*)`, `touch-action: manipulation`(더블탭 확대 방지).
- 라이트/다크 모드 모두 지원(프로토타입의 CSS 토큰 방식 유지), `prefers-reduced-motion` 존중.
- 한국어 UI. 색만으로 정보를 구분하지 않는다(🔵/🔴 이모지·⚑ 등 모양 단서 병행).

## 작업 방식

- 프로토타입 기능을 옮길 때는 `port-from-prototype` 스킬 절차를 따른다.
- core 변경에는 테스트가 따라와야 한다. 프로토타입과 결과가 같은지 확인하는 패리티 테스트를 우선한다.
- UI 작업 후에는 `mobile-check` 스킬로 모바일 뷰포트 확인.
- 서브에이전트: `rules-auditor`(규칙 정합성 감사), `mobile-ux-reviewer`(모바일 UX 리뷰), `ai-tuner`(AI 강도·성능 조정).
- 코드 주석과 커밋 메시지는 한국어 가능. 식별자는 영어로, 프로토타입의 1~2글자 이름(`S`, `cl`, `ev`…)은 의미 있는 이름으로 바꾼다.
