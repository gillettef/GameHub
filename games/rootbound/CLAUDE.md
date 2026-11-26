# Rootbound

웹 브라우저(와 실물 보드게임)로 즐기는 **정원 땅따먹기 보드게임**. 2026-10-16 **오프라인판(v3)** 으로 바꿨다: 차례마다 마켓 2장 중 1장이나 카드 더미 맨 위 1장(뒷면)을 가져와 손 2장 중 1장을 심고, 카드의 **뿌리 모양**을 원하는 방향으로 돌려 내 색 **뿌리 큐브**를 놓는다. 한 칸에는 한 색만 있고 남의 큐브는 1:1로 밀어낸다(줄다리기). 식물은 주인이 없고 그 칸 큐브 주인의 것이다. 1인 큐브 수가 정해져 있어 모자라면 가장 높이 쌓인 내 칸에서 옮겨 온다. 라운드가 끝나면 공급처에 큐브가 가장 많이 남은 사람이 다음 선. 끝나면 내 큐브가 있는 칸 + 목표 카드 3장. 식물 9종(판마다 2·3인 6종 / 4인 8종), 목표 16장. **공모전 응모 범위는 2~3인**(4인은 온라인만).
> **2026-11-26 화면 테마 「냥냥 골목」(골목 길고양이)**: 규칙·엔진 id 는 그대로, 화면·기록·카드 이름과 그림을 고양이 테마로 바꿨다(공모전 응모작, `notes/Contest.md` 6절).
> 식물 → 명당 타일, 뿌리 큐브 → 고양이, 땅 → 내 칸·영역, 입구 → 아지트, 목표 → 소문 카드, 마켓 → 펼친 타일, 카드 더미 → 주머니(대응표: `notes/Rules.md` 맨 위).
> 그림은 클로드 디자인 SVG(`public/art/`, 원본·생성기 `submission/art`·`submission/tools/art-gen`), 색은 밝은 골목 낮 테마(`tokens.css`, 자리 0 치즈냥·1 턱시도냥·2 고등어냥·3 삼색냥).
> 아래 문서의 밤 정원 색·카드 경로(`public/cards`) 설명은 옛 내용이다(옛 카드 그림 파일은 지우지 않고 남겨 둠).

GameHub 공통 배치(① 상태바 ② 플레이어 ③ 보드 ④ 내 영역 ⑤ 행동, 점수·진행·카드·설명은 ≡ 메뉴)로 스크롤 없이 한 화면에서 대국을 진행한다.

> 2026-10-07 사용자 지시로 이전 게임(AstralTab, 카드 기반 우주 전투 보드게임)을 전부 걷어내고 Rootbound 로 교체했다. 예전 규칙·코드는 git 기록에만 있다. 2026-11-25 GameHub 공통 구조로 옮기며 옛 이름(AstralTab, `astraltab.` 저장 키)은 모두 걷어냈다.

**게임 규칙의 정본은 `notes/Rules.md` 다.** 룰 엔진·AI·UI 어디든 규칙이 어긋나면 Rules.md가 맞다. 규칙을 바꿀 때는 Rules.md를 먼저 고친다.

| 문서 | 내용 |
|---|---|
| `notes/Rules.md` | **규칙 정본**. 보드 조립(대칭 조각 배치), 이번 판 식물·공개 단계·라운드(차례 = 가져오기 → 심기, 공급처 큐브 최다 선), 뿌리 큐브 줄다리기·공급처, 식물 9종, 목표 16장, 점수·순위, 온라인 제한 시간(6.3), 상수, 결정성, 밸런스 근거 |
| `notes/Rulebook.md` | **플레이어용 규칙서**(2~3인 실물판, 공모전 제출 초안). 정본은 Rules.md |
| `notes/Cards.md` | 식물 카드 9종·목표 카드 16장·카드 구성 정리(정본 아님, 수치 바꾸면 함께 고침) |
| `notes/Story.md` | 배경 이야기(달빛 정원 박람회). **규칙 아님**. 설명 탭 "이야기" 문단의 원문 |
| `notes/Expansions.md` | 확장판 아이디어 메모(지역별 식물·지형, 구조 준비 사항). **규칙 아님, 구현하지 않음** |
| `notes/Contest.md` | 2027 코리아보드게임즈 공모전 검토(마감 2026-12-31). 2025·2026 당선작 심사평, 5개 지표 점수표·결과, **다음에 이어서 할 일(4절)**. **규칙 아님** |
| `notes/Board.md` | 보드 디자인 참고(시안 `notes/design/board-2p.svg`, 육각 좌표, 지형 4종·현재 색/무늬, 정원 조각 12+입구, 인원별 윤곽·입구 위치·ASCII 그림, 보드 위 요소 표시 방식, 디자인 제약). **규칙 아님**, Rules.md 2·3절 요약 |

---

## 필수 작업 규칙

1. **작업이 끝나면 `git commit` & `git push`를 한다.** 기능 하나, 버그 수정 하나 등 의미 있는 단위마다 커밋하고 푸시한다. `/commit-push` 스킬을 쓴다.
2. **commit 메시지는 가급적 한국어로 작성한다.** 제목은 `<타입>: <요약>` 형식 (예: `기능: 마켓 화면 (F008)`, `수정: 칡 거리 계산`). 관련 F-ID가 있으면 괄호로 덧붙인다.
3. **저장소는 `https://github.com/gillettef/GameHub.git` 의 `games/rootbound/` (모노레포)**. 옛 개별 저장소(`gillettef/Rootbound`)는 2026-11-25 삭제했다. **일상 작업은 `dev`에 커밋·푸시한다.** `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.
4. **이 서비스는 DB를 사용하지 않는다.** DB·Redis·ORM을 도입하지 않는다. 아래 "DB 없는 상태 관리" 참고.
5. 로컬 실행은 `npm run dev -w @gamehub/rootbound`(Vite 하나로 화면과 온라인 방 서버가 함께 뜬다). 포트 3001은 이 PC에서 사용자의 다른 프로젝트(Eleven)가 쓴다. 3001을 점유한 프로세스는 절대 종료하지 않는다.
6. **규칙 변경은 함께 고친다**: `notes/Rules.md` → `src/engine` + `src/engine/data` (Vitest, `test/data.test.ts` 가 Rules.md 표와 데이터를 대조한다) → `npm run fixtures -w @gamehub/rootbound`(AI 테스트가 읽는 판 기록) → 필요하면 AI 평가(`src/ai/search.ts`). AI는 엔진 함수를 그대로 부르므로 규칙 사본이 없다. AI 결정이 바뀌면 `test/legacy.test.ts` 의 기록(`test/fixtures/ai-*.json`)도 다시 만들어야 한다(옛 AI 와의 비교 기록이라, 의도한 변경이면 지우고 새 기준을 남긴다).
7. **Claude Code는 사용자에게 보이는 답변(채팅 응답)을 한국어로 작성한다.** 코드 식별자는 영어, 설명·요약·질문은 한국어.
8. **수치를 바꿀 때는 먼저 시뮬레이터로 잰다**: `npx tsx tools/lab/run.ts <변형> [인원=2,3,4] [배율]` (게임 폴더에서, 변형은 `tools/lab/registry.ts` 에 추가, `LAB_PATCH=<json>` 으로 파일 수정 없이 시험, 여러 변형 비교는 `tools/lab/sweep.ts`). 자리·식물 승률, 재미·결정 지표, 5개 지표 점수표를 출력한다. 결과와 결정 이유는 Rules.md 12절에 남긴다.

---

## 코드 현황 (2026-11-25, GameHub 공통 구조로 이전)

2026-11-25 GameHub 공통 구조(루트 npm workspaces, `@gamehub/net` 방·진행, `@gamehub/ui` 화면)로 옮겼다. 계획·완료 기준은 GameHub `docs/refactor-plan.md`. 옛 `shared`·`server`·`client` 세 패키지(Express·socket.io)는 한 패키지로 합치고 지웠다(git 기록에만 있다). **엔진은 내용 그대로** 옮겼다(가져오는 경로만 바뀜).

- **엔진** (`src/engine`): 타입(`types.ts`), 데이터(`data/constants.ts` 인원별 규칙 `PLAYER_COUNT_RULES`·입구 큐브·목표 점수·제한 시간(`TURN_TIME_OPTIONS_SEC`·`AFK_STRIKES_FOR_AUTOPILOT`)·시간 초과 로그 표지, `data/species.ts` 식물 9종 `SPECIES`·목표 16장 `GOALS`, `data/tiles.ts` 정원 조각), `board.ts` 대칭 보드 조립·축 좌표·칸 이름 `cellLabels`/`cellLabel`(기록용 `C4`), `influence.ts` 뿌리 큐브(칸 주인 `computeOwners`·공급처 `supplyLeft`·회전 `rotateSpot`·줄다리기 `plantRoots`·입구 큐브)·심을 칸 `legalPlantCells`·민들레 씨앗 `legalSeedCells`, `scoring.ts` 땅·목표·점수·순위, `turn.ts` 로비→공개 단계(`CONFIRM`)→라운드(가져오기 `TAKE`(마켓 번호 또는 `'pile'`) → 심기 `PLANT`/`DISCARD`, 공급처 큐브 최다 선)→종료 `applyAction`, 시간 초과 자동 수 `autoAction`, 난수 `rng.ts`, 가림 `mask.ts`(`maskState`·`MaskedGameState`).
- **AI** (`src/ai/search.ts`): 1수 탐욕(심기 = 손 카드 × 칸 × 회전(× 민들레 씨앗 상위 칸)에서 내 총점 − 최고 상대 총점, 가져오기 = 그 카드로 둘 최선 1수 가치 + 공개 목표 연계 가산, 더미 뒷면은 못 본 카드 분포의 기댓값). 가린 상태만 본다. 공통 봇(`def.bot.next`)이 동기 함수라 2026-11-25 이벤트 루프 양보를 빼고 동기로 바꿨다(고르는 수는 같다: `test/legacy.test.ts`). 봇 한 수는 `BOT_TIME_LIMIT_MS`(1초 → 탐색 예산 450ms) 안, 개발 PC 기준 중앙 4ms·최대 50ms. 튜토리얼 연습 봇은 `src/ai/tutorial.ts`.
- **`src/def.ts`** (GameDef, 서버·브라우저 공용): 좌석 번호 = 엔진 자리, 플레이어 id `p<좌석>`, 봇 자리 = 엔진 `'ai'`. 행동 `CONFIRM`·`PICK_CHORE`·`TAKE`·`PLANT`·`DISCARD`·`MOVE`·`CALL`·`SURRENDER`·`RESUME`(v7 일과·담 넘기·명당 부르기 포함)(가져오기·심기·버리기는 고를 때 본 차례 번호 `turn` 을 함께 보내 늦게 도착한 수를 거절), `parseAction` 이 모양과 범위를 검사한다. `view` = 그 좌석 기준 `maskState`(관전자는 아무 손도 안 보임). 옵션 `turnTime`(온라인 차례 제한 시간, 한 기기는 없음)·`tutorial`. 제한 시간은 `GameDef.clock`: 넘으면 자동 수, 심기 차례 시간 초과 2번 연속이면 그 자리를 AI 대리(`autopilot`), '다시 내가 두기'(`RESUME`)로 되찾는다. 시계만 흐를 때는 상태를 다시 보내지 않는다(시계 객체 안에서만 줄인다). 온라인 서버(`server/app.ts`)는 카드 더미 셔플 키를 보드 시드와 따로 암호학적 난수로 넣는다(`makeDef({ deckKey })`).
- **화면** (`src/client`): `App.tsx` 처음(공통 `HomeScreen`: 한 기기·온라인, 이어 하기, 튜토리얼, 규칙, 온라인 제한 시간) → 대기실(공통 `WaitingRoom`) → 대국 `GameView.tsx`(공통 `GameShell` 배치 ①~⑤, 아래 표). 받은 상태는 Zustand `store/gameStore.ts` 에 넣고(`applyView`), 기존 부품(보드 `HexBoard`·카드 `SpeciesCard`·`Market`·`Hand`·`PlantBar`·`RevealPanel`·`GameModal`·`ResultOverlay`·`HandoffOverlay`·`TutorialCoach`·`TurnEvents`, 탭 `StatusTab`·`ProgressTab`·`CardsTab`·`HelpTab`)은 store 를 읽는다. 화면용 파생값은 `game/derived.ts`(엔진 호출만), 효과음·차례 알림 `lib/cues.ts`, 제한 시간 표시 `lib/turnClock.ts`. 스타일은 CSS Modules + `styles/tokens.css`(공통 화면 색 `--gh-*` 도 여기서 정한다).

| 배치 | 내용 |
|---|---|
| ① 상태바 | 차례·할 일(내 차례면 다음 할 일 안내), 남은 시간, 라운드·카드 더미 장수, 접속 끊김 알림. ≡ 메뉴(시트): 점수·진행(기록)·카드·설명 탭, 칸마다 뿌리 수·칸 이름·효과음·차례 알림, 나가기·기권 |
| ② 플레이어 | 자리 색·총점·땅·남은 뿌리·선·AI/AI 대리·확인 여부. 누르면 메뉴 점수 탭 |
| ③ 보드 | 목표 카드 축소판 + 육각 보드(칸은 `data-compact`). 공개 단계에는 이번 판 식물·목표·확인 현황 |
| ④ 내 영역 | 마켓(가져오기 차례에 눌러 가져오기) 또는 심기 확인 바(방향·씨앗·예상 결과) + 내 카드 |
| ⑤ 행동 | 확인(한 기기는 '확인하고 시작'으로 모두) / 카드 더미에서 1장 / 취소·심기 / 다시 내가 두기 / 결과 보기·새 게임 |

- **모드**: 한 기기(사람·봇 섞기: AI 대전, 사람이 둘 이상이면 돌려 하기 — 차례마다 가림 화면, 이어 하기 저장 `rootbound:local`), 튜토리얼(연습 봇, 고정 시드), 온라인(방 코드 4자리·초대 링크 `?room=`, 대기실에서 방장이 시작하면 빈자리는 봇, 새로고침·재접속 복귀, 관전). 끊긴 사람의 차례는 45초 뒤 봇이 대신 두고, 게임 중 나가면 그 자리는 봇이 이어받는다(공통 진행, GameHub `docs/refactor-plan.md` 9절).
- **카드 디자인**(2026-10-08 사용자 제공, SVG): 식물 `public/cards/plants/<종 id>.svg`(630×880)·목표 `goals/<목표 id>.svg`(880×630)·각 `back.svg`. 작은 카드 배경은 그림 부분만 자른 `plants/art/<종 id>.webp`(`node tools/card-thumbs.mjs` 로 생성). 경로는 `src/client/game/cardImages.ts`(페이지 기준 상대경로), 파일 누락은 `cardImages.test.ts`. 카드 안 글자는 `notes/Cards.md` 와 맞춘다(`public/cards/README.md`).
- localStorage 키는 `rootbound:` 접두어(닉네임·접속 정보는 공통 코드, 이어 하기·제한 시간·효과음·알림·튜토리얼 표시).

---

## 다음에 이어서 할 일

- 2026-11-26 v7 「골목 일과」를 엔진·AI·def·화면·테스트·e2e 까지 반영했다. 화면: 일과 고르기(`ChoreRow`), 담 넘기(`MoveBar`), 명당 부르기(`CallBar`), 생선 냄새는 펼친 타일 세 번째 칸. 남은 것: ② 플레이어 칩이 좁아 일과 그림을 넣으면 쉬는 고양이 수가 말줄임됨, 명당 부르기 차례에는 바가 높아 보드가 작아짐. 사람 플레이테스트 0판.
- 할 일 목록과 중단된 실험은 `notes/Contest.md` 4절. 요약: 종이 프로토타입, 규칙서 그림, 기획안, 신청서 접수(12-31 마감).
- 2026-11-25 이전으로 없어진 것(필요하면 공통 코드에 더한다): 방 비밀번호, 방 스냅샷 저장·복원(서버를 다시 시작하면 진행 중인 방이 사라진다), 판 요약·웹 성능 기록(`stats`·`vitals`), 개발용 바로가기 URL(`/hotseat?quick…`), 대기실에서 제한 시간 바꾸기(방을 만들 때 고른다).
- 리뷰에서 남은 낮은 항목: 바닥 층(테두리·줄눈·질감)을 미리 구운 이미지로 바꿔 모바일 다시 그리기 비용 줄이기(HexBoard), RevealPanel 의 px 간격 일부 토큰화.

## 실행 환경 (dev / 운영)

| 환경 | 방법 | 용도 |
|---|---|---|
| dev | `npm run dev -w @gamehub/rootbound` (Vite, 온라인 방 서버 `/ws` 함께) | 로컬 개발 |
| 운영 | GameHub 허브(`gamehub`, :80) 안 `/rootbound/` (inproc, `scripts/aws/hub-entry.mjs` → `server-dist/app.cjs`, 정적 파일 `dist` 는 허브가 서빙) | 공용 EC2(t4g.nano, 서울) |

- 운영 산출물은 러너에서 `npm run build -w @gamehub/rootbound`(vite + esbuild 서버 한 파일)로 만들어 `dist`·`server-dist`·`scripts/aws` 만 올린다(`.github/workflows/deploy-rootbound.yml` → 공통 `deploy-workspace-game.yml`). `dev` → `main` 병합이 곧 배포다. 배포는 허브를 재시작하므로 진행 중인 방이 모두 사라진다.
- 클라이언트는 절대경로를 쓰지 않는다(에셋·WebSocket 모두 페이지 기준 상대경로). 루트 직접 접속에서도 동작한다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript strict | GameHub `packages/config/tsconfig.base.json` |
| 서버 | `@gamehub/net` 의 `createRoomApp(def)` (`ws`, `node:http`) | socket.io·Express 는 2026-11-25 제거 |
| 프론트엔드 | React 19 + Vite + Zustand | 공통 화면 `@gamehub/ui`(Tailwind v4), 게임 부품은 CSS Modules |
| 보드 렌더 | SVG | 축 좌표 육각, viewBox 로 컨테이너에 맞춤 |
| 테스트 | Vitest + Playwright(iPhone 화면, `e2e/mobile.mjs`) | |
| AI | TS, 봇(`def.bot`) | 따로 띄우는 프로세스 없음 |
| 저장소 | **없음** | 서버 메모리. 한 기기 판은 브라우저 localStorage |
| 패키지 관리 | GameHub 루트 npm workspaces (`@gamehub/rootbound`) | `npm install` 은 GameHub 루트에서(이 PC 에서는 대문자 `GameHub` 경로) |

## 디렉터리 구조

```
games/rootbound/
├── CLAUDE.md, DESIGN.md, notes/     # 규칙 정본 notes/Rules.md
├── index.html, vite.config.ts, tsconfig.json, package.json
├── public/cards/                    # 카드 디자인 SVG·썸네일
├── src/
│   ├── engine/                      # 순수 규칙: types, data/, board, influence, scoring, turn, rng, mask
│   ├── ai/                          # search.ts(봇 AI), tutorial.ts(연습 봇)
│   ├── def.ts                       # GameDef: 좌석·행동 검사·가림·제한 시간·봇
│   └── client/                      # App, GameView, components/, tabs/, game/, store/, lib/, styles/
├── server/app.ts                    # createRoomApp(def) (더미 셔플 키는 암호학적 난수)
├── scripts/aws/hub-entry.mjs        # 허브 inproc 진입점
├── test/                            # 엔진·데이터·AI·def·옛 AI 비교(legacy) 테스트, fixtures/
├── tools/                           # lab/(밸런스 시뮬레이터), write-fixtures.ts, board-labels.ts, card-text.mjs, card-thumbs.mjs
└── e2e/mobile.mjs                   # iPhone 17 Pro 화면 확인(모든 모드)
```

---

## DB 없는 상태 관리

- **온라인의 단일 진실 공급원은 서버 메모리**의 방(`@gamehub/net` RoomHub)이다. 방 스냅샷 저장은 없다.
- 화면은 게임 상태를 직접 바꾸지 않는다. 행동을 보내고 받은 상태(View)로 덮어쓴다. 합법 칸 하이라이트·심기 미리보기처럼 UI 편의를 위한 계산은 `src/engine` 의 순수 함수를 그대로 쓴다(중복 구현 금지).
- **손 카드는 비공개다.** 본인 손 카드만 내용을 보내고 타인은 장수만. 카드 더미 순서·RNG 시드는 누구에게도 보내지 않는다(더미는 `pileCount` 장수만). 이번 판 식물·마켓·가져간 카드(마켓에서)는 공개, 더미에서 가져온 카드는 기록에도 이름을 남기지 않는다.
- **로그인/회원가입은 없다.** 닉네임과 재접속 토큰(서버가 좌석마다 발급)은 브라우저 localStorage.

---

## AI

- AI 자리(또는 접속이 끊겨 봇이 대신 두는 사람 자리)의 차례가 오면 공통 진행 코드가 `def.bot.next` 를 부르고, `src/ai/search.ts` 의 `requestAiDecision` 이 수를 고른다. **일반 행동과 똑같이 엔진으로 검증**하고, 거절되면 엔진 `autoAction`(`def.bot.fallback`).
- 연속 시간 초과로 AI 대리(`autopilot`)가 된 자리는 차례 시계(`def.clock`)가 0.8초 뒤 같은 AI 로 둔다.
- AI 는 그 자리가 보는 가린 상태(`maskState`)만 본다. 입력 상태를 바꾸지 않는다. 규칙을 다시 구현하지 않고 엔진 함수를 부른다.
- v7 「골목 일과」(2026-11-26): 모두 1수 탐욕(margin = 내 총점 − 최고 상대 총점). 일과 고르기는 남은 일과마다 이번 차례 최선 1수 값(`choreValues`, 실험실 `choreValue` 와 같은 생각: 놓는 일과는 손 ∪ 마켓 최선 심기 + 식빵 +1·마실 칸, 대장 방울 +0.2·생선 냄새 +0.1, 담 넘기는 탐욕 두 번, 부르기는 최선 칸·방향 + 마켓 가져오기 +0.6). 생선 냄새 차례에는 편 카드가 후보이고 더미 뒷면은 아니다. 튜토리얼 연습 봇은 놓는 일과를 고르고 담 넘기·부르기는 자동 수.
- 다음 과제: 1수 탐욕을 넘어서는 탐색(2인 알파베타, 3~4인 max-n)과 평가 가중치. 무거워지면 서버를 막지 않도록 공통 봇을 비동기(또는 `worker_threads`)로 바꿔야 한다.

---

## 게임 규칙 요약 (자세한 내용은 notes/Rules.md, 2026-10-16 오프라인판, 2026-11-26 v7 「골목 일과」)

- **인원** 2~4명(공모전·실물판 2~3명). **보드**는 칸 7개짜리 정원 조각을 대칭으로 이어 붙인다(2인 7조각 49칸 / 3인 13조각 91칸 / 4인 15조각 105칸). 지형: 빈 땅·기름진 땅(목표용)·연못·바위(큐브 못 놓음).
- **준비**: 목표 3장(보호구역 1장 이상) → 이번 판 식물(2·3인 6종, 4인 8종) → 카드 더미(종마다 2인 4 / 3·4인 5장) → 손 1장 + 마켓 2장 → 입구 둘레 6칸에 큐브 1개씩 → 공개 단계 확인.
- **라운드(v7)**: 일과 6장(`bread` 식빵 굽기·`peek` 생선 냄새·`roam` 마실·`boss` 대장 방울·`move` 담 넘기·`call` 명당 부르기, `data/chores.ts`) 중 (기권 안 한 인원 + 1)장을 보드 시드로 섞어 펼침(`choreOffer`) → 선부터 `PICK_CHORE`(단계 `stage:'chore'`, 고른 일과 `chores[seat]`) → 선부터 자기 일과대로 한 차례. 2인 12 / 3·4인 10 라운드에 끝(`rulesFor(P).rounds`).
- **놓는 일과 차례**: 마켓 2장 중 1장 `TAKE`(빈자리는 바로 채움) 또는 카드 더미 맨 위 1장 `TAKE take:'pile'`(비공개) → 손 중 1장 `PLANT`(회전 `rotation` 0~5, 민들레는 `seed`) 또는 심을 칸이 없을 때만 `DISCARD`. 식빵 굽기 = 심은 칸 +1, 마실 = 내 땅 두 칸 안 빈 칸에도 심기, 생선 냄새 = 더미 맨 위를 펴서(`peek`) 마켓 2장 + 그 1장 중 1장(`take:'peek'`, 뒷면 불가; 마켓 카드를 가져가면 편 카드는 더미 맨 위로), 대장 방울 = 다음 선.
- **놓지 않는 일과 차례**: 담 넘기 `MOVE`(`moves` 1~2번, 내 칸에서 1~2개를 맞닿은 칸으로, 6.2 두 단계로 걷어 내기·놓기) / 명당 부르기 `CALL`(내 땅 위 식물 `pos`, 새 방향 `rotation`, 식물 칸 +1, 능력 없음, 그다음 마켓 `take` — 손 3장이면 없음). 할 수 없으면 쉰다(기록 `pass`). 손 최대 3장(부르기 기준). 다음 선 = 대장 방울, 없으면 공급처 큐브 최다(동점이면 이번 선 다음 자리부터).
- **심을 칸**: 내 땅, 또는 내 땅·입구와 맞닿은 큐브 없는 빈 칸. 연꽃은 연못 옆 빈 칸이면 어디든.
- **큐브**: 상태 `rootSeat`·`rootCount`(칸별 한 색). 남의 큐브는 1:1로 밀어냄. 1인 큐브 2인 16 / 3인 18 / 4인 16, 모자라면 가장 높은 내 칸(같으면 식물 없는 칸 → 칸 순서)에서 옮김. 버섯은 맞닿은 6칸 남의 큐브 −2.
- **식물 9종**: 잔디, 참나무, 소나무, 칡, 고사리, 민들레(씨앗), 연꽃(연못), 버섯(걷어내기), 무궁화(+1점). 담쟁이·대나무·유채는 확장 후보.
- **종료·점수**: 라운드 수를 채우거나 더미·마켓·손이 모두 비면 끝. 점수 = 땅 + 목표 3장 + 무궁화 + 덤(4인만 0,1,1,1). 순위: 기권 안 함 → 점수 → 땅 → 내 땅 위 식물 → 자리 큰 쪽.
- **온라인 제한 시간**(Rules.md 6.3): 방장이 60초/90초/3분/없음. 넘으면 자동 수(일과 = 남은 첫 일과, 담 넘기 = 첫 칸에서 1개, 부르기 = 첫 식물 지금 방향), 차례를 끝내는 단계(심기·담 넘기·부르기) 시간 초과 2번 연속이면 AI 대리.

## 디자인 규칙

**`DESIGN.md` 를 기본으로 작업한다.** UI를 만들거나 바꾸기 전에 반드시 읽는다. 적용 우선순위는 DESIGN.md 자체 규정을 따른다: 사용자 지시 > 저장소 사실 > DESIGN.md > 레퍼런스 영감.

### DESIGN.md에서 그대로 승계하는 것

- **플랫**: `box-shadow` 사용 금지. 구분은 배경색 블록과 여백으로 한다.
- **필 CTA**: 주요 버튼은 50px 라운드 필, 저강조 버튼은 999px 아웃라인 필. 각진 버튼 금지.
- **헤딩은 네이비** `#1a2352`(비게임 화면), 순수 검정 금지.
- **타이포**: 본문·UI는 Pretendard(CDN), 디스플레이는 Gothic A1 900(`--font-display`, 로드 실패 시 Pretendard).
- **간격**: 8px 리듬. 라운드 10px(패널) / 16px(카드) / 24px(큰 컨테이너) / 50px·999px(필).
- **모션**: `motion-fast` 120ms, `motion-standard` 220ms, `motion-slow` 340ms. `prefers-reduced-motion` 존중. 탭 전환은 100ms 예산(F014).
- **상태 문구**: 오류 대신 다음에 할 일을 적는다("내 뿌리가 닿는 빈 칸에만 심을 수 있습니다"). 성공에 이모지 없음. 비활성은 회색 + 투명도.
- **화면 용어**: 화면 용어는 `notes/Rules.md` 2절 "화면 용어" 표를 따른다(코드의 seat → 자리, 손패 → 내 카드 등). 화면에 축 좌표를 보여 주지 않는다. 칸을 가리킬 때는 칸 이름(`C4`, Rules.md 2절 `cellLabels`)을 쓴다(게임 기록·칸 정보·"칸 이름" 토글).
- **보이스**: 선언형·현재형, 짧고 직접적인 CTA("방 만들기", "심기", "기권").

### 컬러 월드

**처음·대기실** (2026-11-25 공통 화면 `@gamehub/ui` 로 옮기며 옛 흰 Corca 프레임 대신 아래 밤 정원 색을 그대로 쓴다. 공통 화면 색 `--gh-*` 는 `tokens.css` 에서 이 토큰으로 정한다).

**게임 대시보드** (2026-10-07 Rootbound 전환, 사용자 지시로 우주 테마를 걷어내고 밤 정원으로): 값은 `src/client/styles/tokens.css` 의 `:root`.

| 역할 | 값 |
|---|---|
| 무대 배경 | 밤 정원 녹색 `#0e1a14` + 반딧불·이끼빛 그라데이션(`GamePage.module.css`) |
| 패널·탭 바·카드 | `#1d3328` |
| 활성·주요 버튼·합법 칸·선택 | Moonlight Cream `#fff3b7` |
| 보드 (2026-10-08 시안 `notes/design/board-2p.svg`) | 바깥 테두리 `#2c455d`, 줄눈 `#2a2a1c`, 구역 경계선 `#94bce3` (`--board-*`) |
| 빈 땅 | 풀밭 무늬 `#6b7a3f` + 풀잎 |
| 비옥토(기름진 땅) | 흙 무늬 `#4b3320` + 새싹 |
| 연못 | 물 그라데이션 `#5d93ad`→`#1f4466` + 물결 무늬(자리 0 파랑 땅과 헷갈리지 않게 어둡게) |
| 돌밭(바위) | 자갈 무늬 `#868a8d` + 둥근 돌 두 개 |
| 자리 0~3 | `#419eff` / `#e69f00` / `#00c58e` / `#f178b6` (땅은 자리 색 38% 덮기 + 자리 색 테, 식물은 카드 그림 썸네일 + 자리 색 고리, 입구는 자리 색 집 모양 + 자리 번호) |
| 위험·경고(돌이킬 수 없는 동작) | Danger Red `#e5484d` (연결 끊김, 기권, 10초 이하 남은 시간) |
| 텍스트 | `#ffffff`, 보조 `#b8c4bc` |

### 구현 방식

- 모든 색·간격·라운드·모션 값은 `tokens.css` 의 CSS 변수로만 쓴다. 컴포넌트 CSS에 HEX 직접 기입 금지.
- 요소 기본값(`body`·`button`·`h1~3` 등)은 `global.css` 의 `@layer base` 안에 둔다(층 밖에 두면 공통 화면의 Tailwind 유틸리티를 덮어쓴다).

### 모바일 우선 (2026-09-22 사용자 지시)

- **화면 폭·높이**: 공통 `gh-app`(최대 440px, `100dvh`, 안전 영역). 미디어 쿼리로 폭 분기를 만들지 말고 처음부터 좁은 폭 하나로 설계한다. 누르는 대상 44×44px 이상(보드 칸은 `data-compact`), 페이지·가로 스크롤 없음(GameHub `docs/refactor-plan.md` 4절).
- **폰트**: 기본 14px, 최소 12px(`--text-micro`).
- **줄바꿈**: `body { overflow-wrap: anywhere }`.
- **게임 레이아웃**: 위→아래 한 방향. 위의 ①~⑤ 표(`GameView.tsx`).
- 화면 확인은 `npm run e2e -w @gamehub/rootbound`(iPhone 17 Pro WebKit, 캡처는 `shots/`).

## 코딩 규칙

- 룰 엔진(`src/engine`)은 **부수효과 없는 순수 함수**로 작성한다. `(state, action) => { state, error? }`. 난수는 상태 안의 시드 RNG만, Rules.md 11절 순서대로. 칸 순서는 `r` → `q`.
- 영향력·땅·점수는 파생값이다. 계산 함수가 정본이고, 상태에 캐시하지 않는다.
- 수치는 `src/engine/data` 한 곳에만 둔다. 엔진·UI·AI 어디에도 하드코딩하지 않는다. Rules.md 표와 데이터 일치는 `data.test.ts` 가 검사한다.
- 서버·클라이언트 공용 타입·상수는 `src/engine`에만. 통신 형식은 공통 코드(`@gamehub/net`)가 정하고, 게임 행동 모양은 `src/def.ts` 의 `Action`·`parseAction` 한 곳.
- 탭 컴포넌트는 `React.memo`(≡ 메뉴 시트 안에서 고른 탭만 그린다).
- 주요 사건(심기, 가져오기, 땅 뺏기, 버리기, 기권, 차례 전환, 시간 초과, 종료)은 `GameState.log` 에 기록한다.
- 룰 엔진 변경은 Vitest 테스트를 함께 추가하고 `npm run fixtures -w @gamehub/rootbound` 후 `npm test -w @gamehub/rootbound` 를 돌린다.
- 주석과 UI 문구는 한국어, 식별자는 영어. 종·목표 id는 Rules.md의 영문 id를 그대로 쓴다.
- AI(`src/ai/search.ts`)는 입력 상태를 바꾸지 않는다. 규칙을 다시 구현하지 않고 엔진 함수를 부른다.

## 자주 쓰는 명령 (GameHub 루트에서)

| 목적 | 방법 |
|---|---|
| 개발 실행(화면 + 온라인 방 서버) | `npm run dev -w @gamehub/rootbound` |
| 의존성 설치 | `npm install` (GameHub 루트) |
| 테스트 · 타입 · 빌드 | `npm test -w @gamehub/rootbound` · `npm run typecheck -w @gamehub/rootbound` · `npm run build -w @gamehub/rootbound` |
| 전체 검사 · 화면 확인 | `npm run check` · `npm run e2e` (모든 workspace) |
| 공용 픽스처 재생성 | `npm run fixtures -w @gamehub/rootbound` (엔진·데이터·타입을 바꾸면 반드시 실행 후 테스트) |
| 카드 SVG 문구·뿌리 그림 다시 그리기 | `node tools/card-text.mjs` (fixtures 를 먼저 만든 뒤) |
| 밸런스 시뮬레이션 (v3) | 게임 폴더에서 `npx tsx tools/lab/run.ts <변형> [인원=2,3,4] [배율]` (5개 지표 점수표), 여러 변형 비교 `tools/lab/sweep.ts`, 정본 엔진 일치 `tools/lab/parity.ts`, 저장 결과 재채점 `tools/lab/rescore.ts`. 변형은 `tools/lab/registry.ts`, 지금 규칙 = `v6`(v5 + 마켓 2장 + 더미 뒷면 가져오기) |
| AWS 서버 로그 | `sudo journalctl -u gamehub -n 200 \| grep rootbound` (EC2 안) |
| 커밋 & 푸시 | `/commit-push` |

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `spec-checker` | 구현 결과를 Rules.md·CLAUDE.md 요구에 대조 |
| `rules-engine-reviewer` | 룰 엔진(보드·영향력·이번 판 식물·라운드 마켓·차례·점수)의 순수성·결정성·Rules.md 일치·엣지 케이스 검토 |
| `realtime-sync-reviewer` | `src/def.ts` 의 가림(손패 비공개)·행동 검사, 재접속, 제한 시간·AI 대리 검토 |
| `ui-tab-reviewer` | 탭 UI 성능(100ms), 무스크롤 레이아웃, 보드·내 카드·마켓 렌더, 리렌더 검토 |
| `ai-reviewer` | AI(`src/ai/search.ts`)의 합법성, 평가, 시간 제한(서버를 오래 막지 않는지) 검토 |

기능 구현을 마치면 `spec-checker`로 확인하고, 영역에 맞는 리뷰어를 거친 뒤 `/commit-push`한다.
