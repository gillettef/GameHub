# Neoterra (네오테라) — 새 행성 개척 문명 카드게임 (모바일 웹)

지구를 떠난 개척민이 낯선 행성에 정착해 1·2·3시대와 종료 시대 동안 문명을 키우는 **카드 기반 문명 건설 게임**. 지도 없이 개인 보드의 **방사형 테크 웹**을 넓히고, 차례마다 공용 **퀘스트 트랙**(쓰루의 카드 줄 자리, 5칸 중 맨 앞만 공개)에서 행성 사건·토착 생물·주둔지 제안·인물·불가사의·자원 팟 카드를 1장씩 골라 가져오며, 세 갈래 **노선**(방주·공생·합성) 중 하나로 문명의 정체성을 굳힌다. 시대는 테크 진행으로 넘어가고, **위성**을 띄우면 퀘스트 트랙의 뒷면 카드를 미리 본다. 종료 시대의 결실 퀘스트가 공개되면 게임이 끝나고, **문화 점수**가 가장 높은 사람이 이긴다.

- 2026-10-30 기획 시작.
- **영감의 출처**: 문명 보드게임 *쓰루 디 에이지스*와 PC 게임 *시드마이어의 문명 5*, *시드마이어의 문명: 비욘드 어스*에서 장르적 영감을 받았다.
- **명칭·카드·구성**: *시드마이어의 문명: 비욘드 어스*를 참고하여 **재설계**했다. 원작의 명칭·카드·수치를 그대로 옮기지 않고 네오테라 용어와 자체 설계로 바꾼다(아래 "오리지널 원칙").
- **모바일 웹 전용**. 한 기기 대전(AI·돌려 하기)은 브라우저 하나에서 완결되고, 온라인 대전만 GameHub 허브 안의 WebSocket 방을 쓴다. **DB 없음**.
- 2026-11-25 GameHub 공통 구조(루트 npm workspaces, `@gamehub/net`·`@gamehub/ui`)로 옮겼다(`docs/refactor-plan.md`). 엔진은 내용 그대로 `src/engine/` 으로 옮겼다.

**게임 규칙의 정본은 `notes/Rules.md` 다.** 엔진·AI·UI 어디든 규칙이 어긋나면 Rules.md가 맞다. 규칙을 바꿀 때는 Rules.md를 먼저 고친다. 지금은 **v0.4 초안**이라 수치 대부분이 "미정"이며, 시뮬레이터로 재면서 확정한다.

| 문서 | 내용 |
|---|---|
| `notes/Rules.md` | **규칙 정본**(v0.4 초안). 구성 요소, 시대 전환, 테크 웹, 노선, 차례 흐름, 대외 단계(습격·분쟁), 후원자·유산·자원 팟, 퀘스트 트랙, 주둔지, 궤도·헌장, 점수, 용어표 |
| `notes/Design.md` | 기획 의도·대안 비교·결정 기록. **규칙 아님** |

---

## 필수 작업 규칙

1. **Claude Code는 사용자에게 보이는 답변을 한국어로 작성한다.** 코드 식별자는 영어, 주석·UI 문구·문서는 한국어.
2. **작업 단위가 끝나면 `git commit` & `git push`** 한다(`/commit-push`, 사용자가 요청한 경우). 커밋 메시지는 한국어, 제목은 `<타입>: <요약>`(예: `기능: 테크 웹 연구 검증`, `수정: 인접 할인 계산`). 테스트·빌드가 통과하는 완결된 단위에서만 커밋한다.
3. **push 대상 repo: `https://github.com/gillettef/GameHub.git` 의 `games/neoterra/` (모노레포, 옛 개별 저장소 `gillettef/Neoterra` 는 2026-11-25 삭제)**. **일상 작업은 `dev` 브랜치에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. 상세는 `docs/environments.md`.
   - 이 저장소의 GitHub 계정은 **`gillettef`만** 쓴다. 로컬 git 설정 `credential.https://github.com.username=gillettef` 로 고정돼 있으니 지우거나 다른 계정으로 바꾸지 않는다.
4. **DB를 쓰지 않는다.** DB·Redis·ORM 도입 금지. 방 상태는 서버 메모리, 개인 데이터는 `localStorage`.
5. 개발 서버를 포그라운드로 띄우지 않는다. `/dev` 로 시작하고 `/dev-stop` 으로 끈다.
6. **포트**: Neoterra 로컬 개발은 Vite **25358**(온라인 방 서버 `/ws` 도 같은 포트, 다른 서비스와 겹치지 않게 고른 고정값). 운영은 허브(:80) 안 `/neoterra/`. 다른 프로젝트 포트(3001·3002 Eleven, 3101·3201 Rootbound, 5173, 5180, 8000·8001, 8080 MagicAcademy, 8090 SmilePark, 8091 DoubleAgent, 8092 Tesseract, 8093 Beltbreaker)를 점유한 프로세스는 절대 종료하지 않는다.
7. **규칙 변경 순서**: `notes/Rules.md` → `src/engine/data` + `src/engine/rules` + 테스트 → UI. 수치를 바꿀 때는 먼저 `/simulate` 로 전후를 재고, 결정 이유를 Rules.md "밸런스 기록" 절에 남긴다.
8. 새 라이브러리 도입 전에는 사용자에게 먼저 확인한다.

## 오리지널 원칙

- 다른 게임의 고유 명칭(게임명, 성향·세력·후원사·승리 조건 이름, 카드 이름)과 아트·문구를 쓰지 않는다. 장르 공통 개념(기술 연구, 불가사의, 시대, 행복도류 자원)은 써도 되지만 **이름은 Rules.md "용어표"의 네오테라 용어**를 쓴다.
- 카드 효과·수치·구성은 직접 설계한다. 기존 게임의 카드 목록을 옮겨 적지 않는다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript (strict) | 엔진·서버·클라이언트 공용. 엔진·화면은 옮기기 전 그대로라 `noUncheckedIndexedAccess` 만 끈다 |
| 프론트엔드 | React 19 + Vite | 공통 설정 `@gamehub/config/vite`(Tailwind, 개발 서버에 온라인 방 서버를 붙임) |
| 화면 틀 | `@gamehub/ui` | 처음 화면 `HomeScreen`, 대기실 `WaitingRoom`, 대국 `GameShell`(①~⑤), 메뉴 시트, 플레이어 패널 |
| 상태 | Zustand(`src/client/store/app.ts`) | UI 상태만. 게임 상태의 권위는 공통 진행 코드(한 기기 `LocalGame`, 온라인 서버) |
| 스타일 | 공통 Tailwind 테마 + 게임 그림은 CSS Modules(`tokens.css` 변수) | 컴포넌트 CSS 에 HEX 직접 기입 금지. 공통 화면 색 `--gh-*` 는 `styles/global.css` 에서 `tokens.css` 와 같은 값 |
| 테크 웹 렌더 | SVG | 노드·연결선, viewBox 로 화면 폭에 맞춤 |
| 방·진행 | `@gamehub/net` | `src/def.ts`(GameDef) 하나로 서버(`server/app.ts` = `createRoomApp(def)`)와 한 기기 대전이 같은 규칙·가림을 쓴다 |
| 테스트 | Vitest, Playwright(iPhone 화면, `e2e/mobile.mjs`) | 엔진은 단위 테스트 필수 |
| 배포 | GameHub 허브 inproc(`scripts/aws/hub-entry.mjs` → `server-dist/app.cjs`) | 루트 `deploy.yml` → `deploy-neoterra.yml` |

## 디렉터리 구조

```
games/neoterra/
├── CLAUDE.md
├── notes/Rules.md          # 규칙 정본
├── src/
│   ├── engine/             # 순수 게임 로직 — DOM·localStorage·Math.random·Date 금지(린트가 막음)
│   │   ├── types.ts        # GameState, PlayerState, TechNode, Card, Action
│   │   ├── data/           # constants, techWeb, cards, doctrines, quests, patrons, satellites
│   │   ├── rules/          # setup, research, actions, production, external, quest, era, scoring, turn + 테스트
│   │   ├── rng.ts          # 시드 RNG
│   │   ├── ai.ts           # AI 결정(봇·자리 비운 사람의 대리)
│   │   └── mask.ts         # 좌석별 가림(덱 순서·시야 밖 퀘스트 칸·종료 퀘스트·시드·남의 손패·비공개 기록)
│   ├── def.ts              # GameDef: 행동 형식 검사, 차례, 적용(거절은 RuleError), 좌석별 view(= maskFor), 봇, 되돌리기 표시
│   └── client/             # React 화면: App(화면 전환·한 기기/온라인 연결), pages/(Home 머리, Table), components/, store/(Zustand·localStorage), styles/, assets/
├── server/app.ts           # createRoomApp(def) — /ws, /health
├── scripts/                # simulate.ts, art/(그림 굽기), aws/hub-entry.mjs
├── e2e/mobile.mjs          # iPhone 17 Pro 화면 확인
└── test/def.test.ts        # GameDef 검사(형식·거절·가림·끝까지 진행·재생 결정성)
```

## 명령어

GameHub 루트(`...\personal\GameHub` 표기 경로)에서 `npm install` 한 뒤 이 폴더에서:

```
npm run dev        # Vite 25358 (--host, 온라인 방 서버 /ws 포함)
npm test           # vitest run
npm run typecheck
npm run build      # vite build + 서버 번들(server-dist/app.cjs)
npm run e2e        # 빌드 결과를 허브(/neoterra/)로 띄워 iPhone 화면 확인(shots/)
npm run simulate -- --games 500 --players 3 --seed 1
```

린트·전체 검사는 루트에서 `npm run lint` / `npm run check` / `npm run e2e`.

## 코딩 규칙

- `src/engine` 는 **순수 함수**: `(state, action) => { state, error? }`. 입력을 변이하지 않는다. 난수는 상태 안의 시드 RNG만.
- 연구 가능 노드·비용·생산량·노선 단계·점수는 **파생값**이다. 계산 함수가 정본이고 상태에 캐시하지 않는다.
- 수치·카드·노드 정의는 `src/engine/data` 한 곳에만. 엔진·UI·AI에 하드코딩 금지.
- 클라이언트·서버 메시지는 공통 `@gamehub/net` 프로토콜. 게임이 정하는 것은 `src/def.ts`(행동·화면·봇)뿐이다.
- 주요 사건(연구, 카드 획득, 건설, 노선 단계 도달, 토착 생물 공격, 위성 발사·추락, 퀘스트 처리, 주둔지, 습격·분쟁, 시대 전환, 종료)은 `GameState.log` 에 남긴다.
- 사용자 입력은 `textContent` 로 넣는다. `innerHTML` 금지.
- `localStorage` 접근은 `src/client/store/storage.ts` 에서만, try/catch, 키 `neoterra:v1:*`(설정 `settings`, 한 기기 이어 하기 `game`). 공통 코드가 쓰는 `neoterra:name`·`neoterra:seats`·`neoterra:session` 은 예외.

## 플레이 모드

1. **한 기기 대전**: 2~4인, 자리마다 사람/AI(공통 처음 화면). 사람 1 + AI 가 기본이고, 사람이 여럿이면 **돌려 하기** — 보는 사람이 바뀔 때 가림막(「○○ 화면 보기」)을 띄운다(손패·위성 시야가 사람마다 다르다). AI 끼리만 두면 관전.
   - 한 판이 길어(2인 90~120분) **매 행동 자동 저장**(좌석·시드·행동 기록)하고 처음 화면 「이어 하기」로 이어 둔다. 기록을 다시 두어 만든다.
   - **되돌리기**: 지금 보는 사람의 행동 중 숨은 정보를 드러내지 않은 것(퀘스트 고르기·습격·분쟁·차례 종료·덱에서 뽑기·난수·시야 변화가 없는 것)만, 최대 30수. 판단은 `src/def.ts` 의 `reveals`, 되돌리기는 기록에서 마지막 수를 빼고 다시 만든다(`App.tsx` 의 `LocalTable`).
   - AI 속도(메뉴): 보통 1.4초·빠름 0.5초·즉시.
2. **온라인 대전**: 방 만들기 → 대기실(4자리 코드, 초대 링크 `?room=CODE`, 방장이 빈자리에 봇 앉히기) → 방장 시작(빈자리는 봇). 계정 없음. **서버가 엔진을 그대로 호출해 정산**하고 좌석마다 `maskFor` 로 가린 상태를 보낸다. 새로고침·재접속은 공통 클라이언트가 저장한 토큰으로 같은 자리에 돌아온다. 끊긴 사람의 차례는 60초 뒤 AI 가 대신하고(`server/app.ts` 의 `awayMs`), 게임 중 나간 자리는 AI 가 이어받아 돌아올 수 없다. 방을 아무도 보고 있지 않으면 AI 도 멈춘다. 관전(코드 입력 후 「관전」)은 모든 손패를 가린 화면을 본다. 서버 재시작 시 진행 중인 방은 사라진다.

## 모바일 UI 원칙

- **주 기준 기기: 아이폰 17 Pro(402×874, 세로)**. 화면 배치는 GameHub 공통 기준(`docs/refactor-plan.md` 4·5절): 페이지·가로 스크롤 없음, 긴 내용은 영역 안에서 스크롤, 누르는 대상 44×44 이상(테크 웹 노드는 `data-compact` — 누른 점에서 가장 가까운 노드를 고른다), 입력 16px 이상, `100dvh` + `env(safe-area-inset-*)`.
- 대국 화면은 공통 `GameShell` 안에 **BGA 의 Through the Ages 테이블처럼 쌓는다**(사용자 지시였던 한 화면 상하 스크롤 테이블을 ③ 영역 안 스크롤로 유지):
  - ① 상태바: 지금 누가 무엇을 하는지 · 시대·라운드·시대 진행 · ≡ 메뉴(게임 설명, 기록, 위성 시장으로, AI 속도, 요약·코치 설정, 나가기)
  - ② 플레이어 패널(공통 `PlayerStrip`): 이름·문화(점수)·방어·남은 지휘. 누르면 그 사람 보드로 스크롤
  - ③ 테이블(영역 안 세로 스크롤): 퀘스트 트랙 → 첫 판 코치 → 플레이어 보드(나 먼저, 식민지 + 테크 웹, 내 보드 위 「지금 가능」 칩) → 공용 영역(위성 시장) → 최근 기록
  - ④ 내 영역: 내 자원·남은 지휘·방위 한 줄
  - ⑤ 행동: 퀘스트 고르기(③의 트랙으로) · 습격 · 분쟁 · 차례 종료 · 되돌리기 · 결과 보기. 상대 차례에는 상대의 마지막 기록 한 줄
  - 상세·행동은 가운데 시트(`components/Sheet.tsx`), 내 결정은 `PendingPrompt`, 요약(시대·지난 내 차례 이후)은 `NoticeLayer`.
- 처음 화면·대기실은 공통 `HomeScreen`·`WaitingRoom`. 처음 화면 머리는 착륙 히어로(`pages/Home.tsx`).
- 카드·배경 같은 이미지, 일러스트, 모션은 Claude Design(Design 아티팩트)으로 만들고 `src/client/assets`·`src/client/styles` 의 SVG/CSS 로 받는다(`docs/art.md`).
- 테크 웹은 작은 화면에서 한눈에 보이도록 고리별 색·노선 아이콘을 쓰고, 노드를 누르면 상세 시트를 연다.

## 배포 (AWS)

- 운영은 GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs` → `server-dist/app.cjs`). 접속은 `http://54.116.67.196/neoterra/`.
- `main` 병합 시 루트 `deploy.yml` 이 바뀐 게임만 골라 `deploy-neoterra.yml` → `deploy-workspace-game.yml`(루트 `npm run check` 통과 후 dist·server-dist·scripts/aws 업로드, 허브 재시작)을 부른다. 허브를 재시작하면 허브 안 다른 게임의 진행 중인 방도 함께 사라진다.
- CI 는 루트 `ci-workspace.yml`(타입체크·린트·테스트·빌드·iPhone 화면 확인).

## .claude 구성

| 종류 | 이름 | 용도 |
|---|---|---|
| 에이전트 | `rules-engine-reviewer` | `src/engine` 순수성·결정성·Rules.md 일치·테크 웹 그래프 엣지 케이스 검토 (읽기 전용) |
| 에이전트 | `balance-analyst` | AI 대 AI 시뮬레이션으로 노선·자리별 승률, 테크 웹 경로 다양성 분석 |
| 에이전트 | `mobile-ui-reviewer` | 모바일 레이아웃·터치·테크 웹 가독성·탭 성능 검토 (읽기 전용) |
| 에이전트 | `online-sync-reviewer` | WebSocket 프로토콜·비공개 정보 가림·재접속·서버 권위 검토 (읽기 전용) |
| 스킬 | `/dev`, `/dev-stop` | Vite 25358(온라인 방 서버 포함) 백그라운드 실행 / 종료 |
| 스킬 | `/commit-push` | 한국어 커밋 후 push |
| 스킬 | `/simulate` | 시드 고정 대량 시뮬레이션과 밸런스 리포트 |
| 스킬 | `/mobile-check` | 타입체크·테스트·빌드 + 모바일 체크리스트 |

기능을 구현하면 영역에 맞는 리뷰어를 거친 뒤 `/commit-push` 한다.
