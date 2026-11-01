# 유세 대작전 (대통령 선거 만칼라)

두 후보(🔵 파랑 / 🔴 빨강)가 6개 권역을 도는 "유세 버스"로 지지자 토큰을 뿌리는 만칼라형 2인 보드게임. 웹 모바일(세로 화면 우선) 게임으로 만든다.

## 현재 상태

- `docs/election-mancala-standalone.html` — **동작하는 프로토타입이자 규칙의 기준 명세**. 단일 HTML, 바닐라 JS, 축약된 변수명.
  - 직접 수정하지 않는다. 규칙이 애매하면 이 파일의 동작이 정답이다.
  - 규칙을 의도적으로 바꿀 때는 사용자에게 먼저 확인하고, `.claude/skills/game-rules/SKILL.md`를 함께 갱신한다.
- 본 구현(Vite + TypeScript)이 아래 구조로 동작한다: AI 대결, 온라인 대결, 이어하기(AI 대결만 localStorage), PWA. 한 기기 2인(핫시트) 모드는 없앴다.
- 온라인 대결은 Cloudflare Workers + Durable Objects(WebSocket Hibernation). 한 Worker가 정적 사이트(`dist/`)와 `/api/room/:code`를 함께 맡는다(`wrangler.jsonc`).
  - 서버가 상태의 기준: 방마다 Durable Object 하나가 `src/core`의 `applyAction`으로 검증·적용하고 상대에게 액션만 전달한다. 클라이언트는 낙관적으로 적용하고, 거부되면 `state` 메시지로 되돌린다. 프로토콜은 `src/net/protocol.ts`(서버·클라이언트 공용).
  - 판단 로직은 `server/room.ts`(순수, Vitest로 테스트), `server/worker.ts`는 저장·소켓만. 방장 자리(🔵 선공 seat 0 / 🔴 후공 seat 1)는 방을 만들 때 Worker가 무작위로 정하고 참가자는 남은 자리. AI 대결도 판마다 내 색을 무작위로 정한다(저장에 `aiPlayer` 포함). 자리는 기기별 `clientId`(localStorage)로 기억해 재접속 시 되찾는다. 24시간 쓰지 않은 방은 알람으로 지운다.
  - 초대 링크는 `?room=CODE`. 프런트를 다른 곳에 호스팅하면 `VITE_API_ORIGIN`으로 API 주소를 지정한다.
  - `wrangler.jsonc`를 바꾸면 `npm run types:server`로 `server/worker-configuration.d.ts`를 다시 만든다.
- 패리티 테스트(`tests/parity.test.ts`)는 프로토타입 HTML의 `<script>`에서 규칙·AI 구간(`/* ---------- 흐름` 주석 앞까지)을 테스트 시점에 잘라 평가한다. 프로토타입의 그 주석이나 함수 이름이 바뀌면 `tests/fixtures/prototype.ts`도 고친다.
- `core/rules.ts`의 `resolveAction`은 연출 박자(Step[])를, `applyAction`은 최종 상태를 돌려준다(둘 다 자동 하차·턴 종료 포함). 박자 사이 지연은 `game/controller.ts`의 `DELAYS`.
- AI는 데스크톱 기준 한 수 평균 ~5ms, 최대 ~30ms라 메인 스레드에서 돈다(Web Worker 미사용).
- 아이콘 PNG는 `node scripts/make-icons.mjs`로 생성(`public/icon.svg`와 같은 도안).
- `public/sw.js`의 `CACHE`/`PRECACHE` 줄은 빌드 때 `vite.config.ts`의 `swManifest` 플러그인이 dist 전체 파일 목록과 내용 해시로 바꾼다. 그 두 줄의 형태(`const CACHE = …` / `const PRECACHE = …`, 한 줄)를 유지할 것.

## 기술 스택

- Vite + TypeScript (strict), UI 프레임워크 없음 — DOM + SVG 직접 렌더링
- 테스트: Vitest
- 배포 형태: 정적 사이트 + PWA (manifest, service worker로 오프라인 플레이)
- 온라인: Cloudflare Workers + Durable Objects. 개발 의존성 `wrangler`만 쓰고 클라이언트는 브라우저 WebSocket.
- 런타임 의존성은 최소화한다(현재 0개). 새 의존성 추가 전 사용자에게 확인.

## 명령

```
npm run dev        # 개발 서버 (모바일 기기 확인 시 --host)
npm run dev:server # 온라인 대결용 로컬 Worker (wrangler dev, 포트 38637 — Vite가 /api를 프록시)
npm run build      # typecheck && vite build
npm run test       # vitest run
npm run typecheck  # tsc --noEmit (브라우저) && tsc --noEmit -p server (Worker)
npm run deploy     # build 후 wrangler deploy (Cloudflare 로그인 필요: npx wrangler login)
```

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
server/      Cloudflare Worker: worker.ts(Durable Object Room), room.ts(순수 방 로직), tsconfig.json(Worker 타입)
tests/       Vitest (parity / rules / controller / validate / online)
scripts/     make-icons.mjs
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
- 턴: ① 예비군 1~2개 투입 → ② 토큰 있는 권역 하나를 비워 버스에 태움 → ③ 다음 권역부터 포화 권역을 건너뛰며 1개씩 하차(색 순서는 플레이어 선택)
- 포화 권역 4곳 이상 또는 예비군 전부 소진 → 선거일(종료)
- 권역 다수 색이 선거인단 획득, 동점은 맨 아래 토큰(⚑) 색. 총점 동점이면 남은 예비군 많은 쪽, 그래도 같으면 무승부

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
