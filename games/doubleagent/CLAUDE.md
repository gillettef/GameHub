# 더블 에이전트 — 에이전트의 전쟁 (모바일 웹)

(구 명칭 '스토브리그'. 야구 용어·드라마 제목과 겹쳐 2026-10-15 변경. 공모전 원본 노트의 파일명은 그대로 둔다)

축구 선수 에이전트가 되어 5라운드(라운드마다 1·2차 협상) 동안 구단과 계약을 중개하면서, 시작 때 몰래 받은 목표 카드 2장(예: 공격수 3명 이상 계약 → +10억)을 채우는 카드/보드게임. 수수료 + 달성한 목표 보너스(억 원)가 가장 큰 사람이 이긴다. (v8, 2026-10-27: 비밀 구단·공개 기록·종료 지목을 목표 카드로 교체)
**모바일 웹 전용**(iPhone 17 Pro 세로 기준, GameHub `docs/refactor-plan.md` 4·5절). 한 기기 플레이(AI 대전·돌려 하기)는 브라우저 하나에서 완결되고, 온라인 대전·관전만 GameHub 허브 안의 WebSocket 방(`/doubleagent/ws`)을 쓴다. **DB 없음** — 방 상태는 서버 메모리, 개인 데이터는 `localStorage`.

- 원본 기획/프로토타입: `notes/stoveleague_README.md`, `notes/stoveleague_source.html` (참고용, 수정하지 않음)
- 규칙·데이터의 단일 기준: `.claude/skills/rules-spec/SKILL.md` — 게임 로직을 건드리기 전에 반드시 읽는다

## 기술 스택 (2026-11-25 GameHub 공통 구조로 옮김)
- TypeScript strict, React 19 + Vite, Tailwind CSS v4(공통 `@gamehub/ui/theme.css` 위에 `--gh-*` 색만 바꾼다, `src/client/style.css`)
- 공통 코드: `@gamehub/net`(방·진행·봇 예약·한 기기 `LocalGame`·온라인 `useRoom`), `@gamehub/ui`(HomeScreen·WaitingRoom·GameShell·PlayerStrip·Sheet·ResultList·LogList)
- 테스트: Vitest(엔진 `src/engine/core.test.ts`, GameDef `test/def.test.ts`), 화면: Playwright WebKit(`e2e/mobile.mjs`)
- 서버: `server/app.ts` = `createRoomApp(def)`. 빌드가 `server-dist/app.cjs` 한 파일로 묶고 허브가 `scripts/aws/hub-entry.mjs` 로 불러 실행한다(inproc)
- 린트·tsconfig·Vite 설정은 GameHub 루트 공통(`packages/config`)

## 플레이 모드
1. **한 기기 AI 대전** — 사람 1명 + 봇(AI) 2~3명 (3~4인). 처음 화면에서 자리마다 사람/봇, 봇 난이도(쉬움/보통, 모든 봇 공통)를 고른다
2. **돌려 하기(핫시트)** — 한 기기를 돌려 가며 사람 2~4명(+봇). 제안을 쓸 사람이 바뀔 때마다 "EYES ONLY" 가림 화면, 결과 화면에서는 목표 카드를 감춘다. 결과의 '다음'은 한 번만 누른다
3. **봇끼리 관전** — 한 기기에서 모든 자리를 봇으로 두면 0번 봇이 진행을 맡아 끝까지 둔다
4. **온라인 대전** — 방장이 방을 만들면 4자리 코드(+ `?room=CODE` 초대 링크) → 대기실 → 방장 시작, 빈자리는 봇. 각자 1·2차 제안을 내고 모두 내면 **서버가 정산**, 결과 화면은 접속한 사람이 모두 '다음'을 눌러야 진행
   - 재접속: 서버가 좌석마다 준 토큰(`doubleagent:session`)으로 새로고침·끊김 뒤 자리로 돌아온다. 끊긴 사람의 차례는 45초 뒤 봇이 대신 낸다(보통·균형형 AI 와 같은 방식)
   - 게임 중 나가면 그 자리는 봇이 이어받고 돌아올 수 없다. 아무도 보고 있지 않으면 진행이 멈춘다
5. **관전** — 방 코드로 들어와 공개 정보만 본다(목표 카드는 끝날 때 공개)
- 이어 하기: 한 기기 판은 행동 기록(`doubleagent:local`)을 저장해 두고 처음 화면의 "진행 중인 게임 이어 하기"로 돌아온다. 전적은 `doubleagent:stats`
- 서버 재시작(배포) 시 진행 중인 온라인 방은 사라진다

## 숨은 정보 (`src/def.ts` 의 `view`)
좌석마다 남의 목표 카드(`-1`), 다음 라운드 뒤의 이벤트, 구단 요구 카드 더미 순서(`-1`), 난수 상태(`0`), 아직 정산 전인 남의 제안(누가 냈는지만 `done`)을 가린다. 관전은 모든 목표 카드를 가린다. 끝나면(`phase: 'done'`) 전부 공개.

규칙 엔진은 입출력이 직렬화 가능한 순수 함수로 유지한다 (서버·한 기기가 `src/def.ts` 를 거쳐 그대로 쓴다).

## 디렉터리 구조
```
src/
  engine/      # 순수 게임 로직 — DOM·localStorage·Math.random·Date.now 직접 사용 금지(ESLint 가 막는다)
    types.ts   # GameState, Offer, Player, Club, Event 타입
    data.ts    # 선수/구단/이벤트/목표 카드 정적 데이터, RULES
    rng.ts     # 시드 기반 난수 (mulberry32)
    rules.ts   # evaluateOffer(매력도·수수료 계산), 유효성 검사
    resolve.ts # resolveRound: 경쟁 판정·점수 반영·로그 생성 (AI 제안도 여기서 만든다)
    ai.ts      # AI 에이전트 제안 생성(성향별)
    game.ts    # createGame / dealRound / nextRound / finishGame(목표 카드 공개·정산)
    core.test.ts
  def.ts       # GameDef: 행동(bid·ready) 검사, 좌석별로 가린 view, 대리 봇
  client/      # React 화면: App(처음·대기실·한 기기 가림 화면), Table(GameShell 대국), cards(카드·확대 카드), bid(제안 작성 상태), RulesText, store(localStorage), art/(카드 일러스트 SVG)
server/app.ts  # createRoomApp(def)
scripts/       # 밸런스 시뮬레이션(simulate·league·calibrate 등, `npx tsx scripts/<이름>.ts`), print-kit, aws/hub-entry.mjs
test/          # def.test.ts,  e2e/mobile.mjs  iPhone 화면 확인
```

## 대국 화면 배치 (GameShell ①~⑤)
① 할 일(내 차례·제출 완료·결과)과 라운드·이벤트 ② 에이전트 줄(공개 수수료·계약 수·남은 카드, 누르면 계약 현황·남은 카드) ③ 협상 차수 탭 + 이벤트·시장 선수·구단(영역 안 스크롤, 카드마다 확대 버튼) / 라운드 결과·계약 현황 / 최종 순위·목표 카드 공개 ④ 내 목표 카드 2장 + 요구 수수료 카드(남은 장수) ⑤ 예상 매력도·수수료 + 1차 패스·2차 작성 / ← 1차·2차 패스·제출 / 다음 라운드. ≡ 메뉴: 계약 현황·라운드별 결과·기록·규칙·나가기

## 명령어 (게임 폴더에서. 설치는 GameHub 루트에서 `npm install` 한 번)
```
npm run dev        # vite --host. 화면과 온라인 방 서버(/ws)가 같은 포트로 함께 뜬다
npm run build      # vite build + server-dist/app.cjs
npm start          # 빌드 결과를 허브 방식으로 실행 → http://localhost:8080/doubleagent/
npm run test       # vitest run
npm run typecheck  # tsc --noEmit
npm run e2e        # 빌드 결과를 iPhone 17 Pro 화면으로 모든 모드 확인, shots/*.png
```
커밋 전에는 GameHub 루트에서 `npm run check`(타입·린트·테스트·빌드)와 `npm run e2e`.

## 코딩 규칙
- `src/engine`는 순수 함수만. 난수는 반드시 `rng` 인자로 주입 → 시드로 재현 가능한 테스트/시뮬레이션
- 게임 상태는 불변 업데이트(새 객체 반환). UI는 상태 → 화면 렌더링만 담당
- 금액은 억 단위 `number`, 계산 후 표시할 때만 `Math.round(x*100)/100` 처리. 누적 오차를 피하기 위해 내부 저장값도 정산 시점에 소수 둘째 자리로 반올림
- 사용자 입력(닉네임 등)은 React 텍스트로만 넣는다. `dangerouslySetInnerHTML` 은 엔진 데이터로 만든 카드 일러스트 SVG(`src/client/art`)에만 쓴다
- 클라이언트는 절대경로를 쓰지 않는다(허브 `/doubleagent/` 아래에서 동작)
- `localStorage` 접근은 `src/client/store.ts`(와 공통 HomeScreen·RoomClient)에서만, try/catch로 감싸고 실패해도 게임은 진행 가능해야 함. 키는 `doubleagent:` 접두어. (옛 `doubleagent:v1:*` 프로필·저장은 2026-11-25 이전 뒤 읽지 않는다)
- UI 문구는 한국어
- 테마는 축구 (아이콘 ⚽, 포지션 FW/MF/DF/GK). 프로토타입의 ⚾ 등 야구 요소는 가져오지 않는다

## 모바일 전용 UI 원칙
- 기준 iPhone 17 Pro 402×874 세로. 가로 스크롤·페이지 스크롤 금지(긴 목록은 영역 안에서 스크롤)
- 터치 타깃 최소 44×44px, hover에 의존하는 정보 금지
- `viewport-fit=cover` + `env(safe-area-inset-*)`로 노치/홈바 대응. 높이는 `100dvh`
- 주요 액션(제출/다음)은 GameShell ⑤ 하단 고정 바에 배치
- 데스크톱에서 열면 모바일 폭(최대 440px, 공통 `gh-app`) 중앙 정렬로 표시
- 핀치 줌으로 인한 레이아웃 깨짐, 더블탭 확대(`touch-action: manipulation`) 방지
- 다크 테마 기본 (`--gh-bg #0b1220`, `--gh-primary #f5c86b`, 초록 `--da-green #7fb3a1`)

## 작업 흐름
- 세션 내 대화는 가급적 한국어로 한다
- 규칙 변경 시: `rules-spec` 스킬 문서를 먼저 고치고 → 엔진/테스트 → UI 순서로 반영
- 로직 변경 후 `npm run test`, UI 변경 후 `/mobile-check` 스킬(`npm run e2e` 포함)로 확인
- 밸런스 수치 조정은 `balance-analyst` 에이전트로 시뮬레이션 근거를 남긴 뒤 진행

## 배포 (AWS)
- 운영은 GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs` → `server-dist/app.cjs`). 접속은 `http://54.116.67.196/doubleagent/`. 예전 단독 서버(포트 8091, systemd `doubleagent`, `deploy-aws.ps1`·`serve.mjs`·`deploy-remote.sh`)는 2026-11-25 지웠다.
- `main` 병합 때 GameHub `deploy.yml` 이 `.github/workflows/deploy-doubleagent.yml` → 공통 `deploy-workspace-game.yml` 을 불러 빌드·전송하고 허브(`gamehub`)를 재시작한다 — 허브 안 다른 게임의 진행 중인 방도 함께 사라진다. Actions → Deploy doubleagent 로 수동 재배포.
- CI 는 루트 `ci-workspace.yml`(타입·린트·테스트·빌드·iPhone 화면 확인).

## Git
- 저장소: https://github.com/gillettef/GameHub.git 의 `games/doubleagent/` (모노레포, 옛 개별 저장소 `gillettef/DoubleAgent` 는 2026-11-25 삭제) (`origin`, 기본 브랜치 `dev`)
- **일상 작업은 `dev`(기본 브랜치)에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.
- 모든 작업이 끝나면 git commit 후 push까지 진행한다
- 커밋 메시지는 가급적 한국어로 작성한다 (예: `규칙 엔진: 빅딜 시즌 동률 보너스 처리`)
- 커밋 전 GameHub 루트에서 `npm run check` 와 `npm run e2e` 가 통과해야 한다

## .claude 구성
- 에이전트 (`.claude/agents/`)
  - `rules-engine` — `src/engine` 규칙 엔진 구현·테스트 담당
  - `mobile-ui-reviewer` — 모바일 UX/접근성/레이아웃 리뷰 (읽기 전용)
  - `balance-analyst` — AI 대 AI 시뮬레이션으로 밸런스 분석
- 스킬 (`.claude/skills/`)
  - `rules-spec` — 규칙·데이터 단일 기준 문서
  - `mobile-check` — 타입체크·테스트·빌드 + 모바일 체크리스트 검증
  - `simulate` — 시드 고정 시뮬레이션 실행 및 리포트
  - `dev` — 로컬 개발 서버(vite, 온라인 방 서버 포함) 백그라운드 실행
