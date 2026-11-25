# 유세 대작전 (대통령 선거 만칼라)

두 후보(🔵 파랑 / 🔴 빨강)가 6개 권역을 도는 "유세 버스"로 지지자 토큰을 뿌리는 만칼라형 2인 보드게임. 웹 모바일(세로 화면 우선) 게임으로 만든다.

## 현재 상태

- `docs/election-mancala-standalone.html` — **동작하는 프로토타입이자 규칙의 기준 명세**. 단일 HTML, 바닐라 JS, 축약된 변수명.
  - 직접 수정하지 않는다. 규칙이 애매하면 이 파일의 동작이 정답이다. 단, 턴당 투입 개수(프로토타입 1~2개 → 본 구현 1개)는 의도적으로 다르다.
  - 규칙을 의도적으로 바꿀 때는 사용자에게 먼저 확인하고, `.claude/skills/game-rules/SKILL.md`를 함께 갱신한다.
- 2026-11-25 GameHub 공통 구조(루트 npm workspaces, React, `@gamehub/net`·`@gamehub/ui`)로 옮겼다(`docs/refactor-plan.md` 3-c). 엔진(`src/engine`)은 옛 `src/core`를 **내용 그대로** 옮겼다.
- 모드: 한 기기(나 vs 봇 — 기본, 두 사람이 돌려 하기, 봇끼리 관전), 이어 하기(한 기기 판, `election:current`), 온라인(대기실 → 방장 시작, 빈자리는 봇, 초대 링크 `?room=CODE`, 새로고침·재접속 복귀, 관전), 바로 시작 링크 `?play`(나 vs 봇). 화면 테마(자동·밝게·어둡게, `election:theme`).
- 선공(🔵 파랑)은 판을 만들 때 시드로 추첨한다(`def.setup` 의 `blue` = 파랑을 맡은 좌석). 좌석 번호와 후보 색은 다르므로 `seatOf`/`colorOf`(src/def.ts)로 바꾼다.
- 진행은 공통 코드가 맡는다: 서버(온라인)·브라우저(한 기기 `LocalGame`)가 같은 `src/def.ts`(GameDef)로 행동을 검사·적용한다. 완전 정보 게임이라 `view` 는 시드만 빼고 상태와 마지막 행동을 보낸다.
- 연출: 서버는 행동마다 최종 상태만 보낸다. 화면(`src/client/playback.ts`)이 직전 상태에 마지막 행동을 다시 적용(`resolveAction`)해 자동 내리기·차례 넘김을 박자(800ms, 움직임 줄이기면 250ms)마다 보여 주고, 그동안 입력을 막는다. 한 기기에서는 연출이 끝날 때까지 봇을 멈춘다.
- 봇(`def.bot`)은 옛 AI(`src/engine/ai.ts` `chooseActions`, 2수 탐색)로 한 차례를 한 번에 계획해 하나씩 둔다(계획이 상태와 어긋나면 다시 계획, 그래도 없으면 첫 합법 수). 난수는 시드와 version 으로 만든다. AI는 한 수 평균 ~5ms라 서버·메인 스레드에서 돈다.
- 패리티 테스트(`test/parity.test.ts`)는 프로토타입 HTML의 `<script>`에서 규칙·AI 구간(`/* ---------- 흐름` 주석 앞까지)을 테스트 시점에 잘라 평가한다. 프로토타입의 그 주석이나 함수 이름이 바뀌면 `test/fixtures/prototype.ts`도 고친다.
- `src/engine/rules.ts`의 `resolveAction`은 연출 박자(Step[])를, `applyAction`은 최종 상태를 돌려준다(둘 다 자동 하차·턴 종료 포함).
- 아이콘 PNG는 `npm run icons`(`scripts/make-icons.mjs`)로 생성(`public/icon.svg`와 같은 도안). 서비스 워커는 없앴다(운영이 HTTP 라 등록되지 않았다).
- 비주얼 방향(2026-11-02): "개표방송 × 인쇄 보드게임". 라이트는 크라프트지(`--bg #f2ede2`), 다크는 개표방송 네이비(`--bg #0e1320`). 제목·점수는 Google Fonts `Black Han Sans`(`.el-disp`, 받지 못하면 시스템 글꼴), 본문은 시스템 글꼴. 기표 도장(卜) 로고, 선거인단 35칸 줄다리기 바, 단계 칩, 속보 줄, 개표 결과 시트. 색 토큰은 `src/client/style.css` 맨 위이고, 공통 화면 색(`--gh-*`)도 그 토큰으로 입힌다. 게임 전용 CSS 클래스는 `el-` 접두어(Tailwind 유틸리티와 겹치지 않게).

## 기술 스택

- 모노레포 공통 스택(`docs/refactor-plan.md` 3절): TypeScript strict(엔진은 옛 코드 그대로라 `noUncheckedIndexedAccess` 만 끔), React 19 + Vite, Tailwind v4(공통 화면) + 게임 CSS, 공통 `@gamehub/net`(방·진행·봇)·`@gamehub/ui`(처음·대기실·대국 틀), 서버 `ws`(esbuild 단일 번들 `server-dist/app.cjs`), Vitest, Playwright(iPhone 화면).
- 새 라이브러리는 먼저 사용자에게 확인한다.
- 운영: GameHub 허브 안에서 실행(`hub/games.json` `"mode": "inproc"`, `scripts/aws/hub-entry.mjs`). 접속 `http://54.116.67.196/election/`. 클라이언트는 절대경로를 쓰지 않는다.

## 명령

모노레포 루트에서 `npm install` 한 번(이 PC 에서는 `...\personal\GameHub` 대문자 표기 경로에서). 아래는 `games/election` 에서:

```
npm run dev        # Vite 개발 서버 + 온라인 방 서버(/ws) 함께 (--host)
npm run build      # vite build + 서버 번들(server-dist/app.cjs)
npm test           # vitest run (엔진·패리티·GameDef)
npm run typecheck  # tsc --noEmit
npm run e2e        # 빌드 결과를 허브 방식으로 띄워 iPhone 17 Pro 화면 확인(e2e/mobile.mjs, shots/)
npm start          # 빌드 결과를 허브와 같은 방식으로 실행(PORT, 기본 8080 → /election/)
```

로컬 포트 관례: 개발 38617, 미리보기 38627(`dev`·`dev-stop` 스킬). 다른 프로젝트 포트를 점유한 프로세스는 절대 종료하지 않는다.

## Git·브랜치·배포

- 모노레포 `https://github.com/gillettef/GameHub.git` 의 `games/election/`. GitHub 계정은 **`gillettef`만** 쓴다.
- 일상 작업은 `dev`에 커밋·푸시(CI만). `main`(운영 배포)에는 직접 커밋하지 않고 사용자가 요청할 때만 `dev` → `main` PR. 병합하면 `.github/workflows/deploy.yml` 이 `deploy-election.yml`(공통 `deploy-workspace-game.yml`)로 배포한다. 수동: Actions → Deploy → `games`에 `election`.
- CI 는 루트 `ci-workspace.yml`(타입체크·린트·테스트·빌드·iPhone 화면 확인).
- 배포하면 허브(`gamehub`)가 재시작되어 진행 중인 방이 모두 사라진다(DB 없음, 방은 메모리).

작업을 끝냈다고 말하기 전에 모노레포 루트에서 `npm run check`(와 화면을 바꿨으면 `npm run e2e`)를 통과시킨다.

## 아키텍처

```
src/
  engine/    순수 게임 로직(옛 src/core 그대로). DOM·타이머·Math.random 금지. 결정적.
    types.ts       GameState, Phase, Player, Action
    constants.ts   CAP=[8,7,6,6,4,4], 권역 이름, 초기 예비군 [10,11], 배치 토큰 4
    rules.ts       initialState, applyAction, resolveAction, legalActions, score, winner, isOver
    ai.ts          AI 의사결정 (rng 주입)
    rng.ts         Rng 타입, 시드 난수(mulberry32)
    validate.ts    외부에서 온 값의 GameState·Action 검사(parseAction 이 isAction 을 쓴다)
  def.ts     GameDef: 선공 추첨·좌석↔색, parseAction, apply(RuleError), view, 기록 문구, 봇
  client/    React 화면: App(화면 전환·이어 하기), Table(①~⑤), Board, Result(개표 결과), playback(연출 박자), RulesText, theme, style.css
server/app.ts  createRoomApp(def)
scripts/   aws/hub-entry.mjs(허브 inproc 진입점), make-icons.mjs
test/      Vitest: rules, parity(프로토타입), validate, def(GameDef·온라인·봇)
e2e/       mobile.mjs (iPhone 17 Pro 화면 확인)
```

화면 배치(`docs/refactor-plan.md` 5절):

| 자리 | 내용 |
|---|---|
| ① 상태바 | 누구 차례·할 일(사전 배치 남은 수, 다음 정차), 연출 중 "유세 버스 이동 중…", 끝나면 당선 결과. ≡ → 기록·게임 방법·화면 테마·나가기 |
| ② 플레이어 | 두 후보(파랑 먼저): 이름, 표, 예비군·사전 배치 남은 수, 차례 강조, 끊김 |
| ③ 보드 | 선거인단 35칸 줄다리기 바·미확정 표, 단계 칩(① 투입 ② 출발 ③ 유세 / 사전 배치), 원형 보드(포화 게이지·버스), 속보 줄(누르면 기록) |
| ④ 내 영역 | 없음 |
| ⑤ 행동 | 유세 중 파랑/빨강 내리기, (투입 2명 규칙일 때) 투입 완료, 안내·대기 문구, 봇 관전 일시정지·새 판, 끝나면 결과 보기·다시 하기·처음으로 |

핵심 원칙:

- **상태 변경은 오직 `applyAction`/`resolveAction`(엔진)으로**, 방·화면은 `def.apply` 를 거친다. 액션은 `place(hole)`, `endPlace`, `pick(hole)`, `drop(color)`, 셋업 단계의 `setup(hole)`. 액션에는 좌석이 없고, `apply` 가 지금 둘 후보의 좌석과 맞는지 본다.
- `GameState`는 JSON 직렬화 가능해야 한다. 클래스·Map·Set 사용 금지.
- 연출 전용 값(마지막 하차 위치 등)은 엔진 상태에 넣지 않는다(`playback.ts`).
- AI는 무거울 수 있다(2수 전탐색). 저사양 모바일에서 한 수에 1초를 넘기지 않는 것이 목표.

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

- 기준은 iPhone 17 Pro 세로(402×874, `docs/refactor-plan.md` 4절). 가로 스크롤·페이지 스크롤 없이 전체 보드가 보일 것(최소 폭 360px). 가로 화면은 "세로로 돌려 주세요".
- 터치 타깃 최소 44×44px. hover에 의존하는 상호작용 금지.
- `viewport-fit=cover` + `env(safe-area-inset-*)`, `touch-action: manipulation`(더블탭 확대 방지).
- 라이트/다크 모드 모두 지원(프로토타입의 CSS 토큰 방식 유지), `prefers-reduced-motion` 존중.
- 한국어 UI. 색만으로 정보를 구분하지 않는다(🔵/🔴 이모지·⚑ 등 모양 단서 병행).

## 작업 방식

- 프로토타입 기능을 옮길 때는 `port-from-prototype` 스킬 절차를 따른다.
- 엔진(src/engine) 변경에는 테스트가 따라와야 한다. 프로토타입과 결과가 같은지 확인하는 패리티 테스트를 우선한다.
- UI 작업 후에는 `mobile-check` 스킬로 모바일 뷰포트 확인.
- 서브에이전트: `rules-auditor`(규칙 정합성 감사), `mobile-ux-reviewer`(모바일 UX 리뷰), `ai-tuner`(AI 강도·성능 조정).
- 코드 주석과 커밋 메시지는 한국어 가능. 식별자는 영어로, 프로토타입의 1~2글자 이름(`S`, `cl`, `ev`…)은 의미 있는 이름으로 바꾼다.
