# CLAUDE.md

이 문서는 이 저장소에서 작업하는 모든 AI 코딩 에이전트(Claude Code 등)가 반드시 따라야 할 규칙을 정의합니다.

## 프로젝트 개요

**마법학교**는 신비롭고 아기자기한 마법 학교를 배경으로 한 보드게임을 웹 서비스로 만드는 개인 프로젝트입니다.

- 원작 보드게임 기획은 **`notes/기획_정리.md`**(원본 PDF·pptx·xlsx를 검토·통합한 요약, 어느 버전이 채택되었는지와 미정 항목 정리)가 기준입니다. 원본 파일은 저장소에서 삭제했으며 대조가 필요하면 git 이력에서 꺼냅니다. 아직 세부 규칙이 확정되지 않은 부분("작성 중")이 있으므로 규칙 관련 작업 전에는 항상 최신 내용을 먼저 확인합니다.
- 지향하는 톤앤매너: **아기자기하고 귀여운(cute, cozy) 비주얼**. 어둡거나 딱딱한 판타지 톤이 아니라 밝고 사랑스러운 일러스트 감성을 목표로 합니다.
- 플랫폼: **웹 서비스**, **모바일 환경 최우선 최적화**(모바일 퍼스트: 터치 조작, 세로 화면, 작은 화면에서의 가독성/조작성을 최우선으로 설계하고, 데스크탑은 그다음으로 대응).
- **주의(2026-11-25 확인)**: 코드의 기본값(`src/engine/config.ts`)은 아래 62절 요약이 아니라 `notes/기획_정리.md` 63-3절 `skillRules: true`다 — 기운이 없고, 주사위 = 주문력, 판정에 그 분야 능력치·곁의 생물·노트를 더하고, 다시 굴리기 = 체력 번, 수업은 배우기(능력치 +1) 또는 노트(+2). 화면도 이 규칙으로 보인다.
- 게임 핵심 개념(2026-10-17 기준 요약, 변경될 수 있음 — 현재 규칙은 `notes/기획_정리.md` 61절 "라이트 규칙" + 62절 "활동 카드 한 덱·시험 공고"(62-7 인원만큼 공개·공짜 주사위 없음)): 핵심 한 줄은 **"기운(컨디션)은 얼마든지 모을 수 있지만, 한 번에 쓸 수 있는 건 실력(능력치) + 1만큼"**. 플레이어는 학생이 되어 지력/체력/매력/주문력(시작 1)을 키우고 승점인 **학점**을 모으며 12개월 동안 1주차(학교 소식: 행사 카드 12장 중 1장 — 4월은 중간고사·10월은 기말고사 공고가 그달 소식, 그달 활동 카드 인원만큼 공개)-2주차(정규수업: 인원만큼 공개된 수업카드 중 1장, 그 과목 기운 +2, 7개월부터 주문력 과목이 많은 2학기 덱)-3주차(자율활동)-4주차(정리, 선이 시계방향 한 칸)를 진행한다. 차례는 정규수업·자율활동·시험 모두 **학점이 낮은 사람부터**(같으면 선부터 시계방향). 자율활동은 구역 없이 **활동 카드 한 덱**(마법생물 21·연구 16·탐험 16·겨루기 14장을 섞음)에서 매달 인원만큼 공개해 1장씩 고른다. 종류 = 능력치: 마법생물 조련(매력기운)·별빛 다락방 탐험(체력기운)·연구실 실험(지력기운)·마법 겨루기(마나기운). 모두 먼저 고른 뒤 고른 순서대로 진행한다. 굴릴 때는 그 카드의 기운을 **1~능력치+1개** 내고 **낸 개수만큼** 굴린다(공짜 주사위 없음, 그 기운이 하나도 없으면 주사위 1개, 다시 굴리기 없음, 결과는 확인 버튼 뒤 적용). 조련·탐험·연구는 카드의 목표 이상이면 성공하고 카드 보상을 받는다. 실패하면(겨루기는 도전자가 지면) 카드를 버리고 **낸 기운 중 1개는 남아** 다음 달로 이월된다. 성공(겨루기는 승리)하면 그 활동의 능력치 **+1(성장)·학점 +1** — 능력치는 성장·카드 보상으로만 오른다. 마법생물 카드는 학점 +1과 교감(하늘 주문력·육지 체력·바다 지력 +1), 연구 카드는 지력 이외 능력치를 준다. 마법 겨루기 카드를 고르면 친구 한 명을 지목(한 사람은 한 달에 한 번만 지목받고, 지목당해도 자기 활동은 그대로 함)해 지목당한 친구는 **주사위 1개 + 주문력**으로 자동으로 막고, 도전자가 마나기운 주사위로 **더 높아야** 승리(주문력 +1·학점 +1 + 승리 학점 +1, 그리고 "겨루며 배운다": 상대가 나보다 높은 능력치 중 차이가 가장 큰 것 +1), 막아 내도 보상은 없다. 6·12개월은 시험 달(수업·활동 없이 이월된 기운으로): 과목은 시험 카드 8장 중 무작위(중간·기말은 주사위 기운이 다름, 4·10월 공고, 예: 비행 실기 = 체력기운 주사위 + 주문력), 기운 0~능력치+1개 + 공짜 주사위 1개, 벼락치기 없음, 학점 3/2/1. 졸업식은 **네 능력치 순위**(마법상·수석상·튼튼상·생물사랑상=매력)마다 1위 +4·2위 +2·3위 +1, 시작할 때 무작위로 받는 비밀 **장래희망**(1장, 63절)의 두 능력치가 모두 5 이상이면 학점 +2. 최종 학점이 높은 사람이 이기고 같으면 1위 상이 많은 사람. 카드는 8종 151장(수업 52·마법생물 21·연구 16(목표 5~7)·탐험 16·겨루기 14·시험 8·장래희망 12·행사 12). 나중에 오프라인 보드게임으로 만들 예정이라 **동시 진행은 없다**(여러 명이 굴리는 판정도 한 명씩 차례대로). 밸런스는 전략 AI 10종(구역 성향 5종 + 판단 방식 4종 + 균형형) 리그로 검증한다(`npx tsx scripts/ai-league.ts`, 61-1절). 예전 규칙(구역·5구역·반짝 마법 경연·고정 시험·심화 수업·벼락치기·특별상·다시 굴리기 등)은 `config.ts` 스위치로 남아 있다.

## 필수 작업 규칙

1. **모든 작업 후에는 반드시 git commit & push를 진행한다.** 코드/문서 변경이 끝나면 작업을 마치기 전에 항상 커밋하고 원격 저장소로 push까지 완료한다. (이 규칙은 커밋·푸시에 대한 사전 승인으로 간주한다 — 매번 별도로 허락을 구할 필요는 없으나, 변경 내용이 크거나 위험한 작업(force push, 히스토리 변경 등)은 예외로 사용자에게 먼저 확인한다.)
2. **커밋 메시지는 가급적 한국어로 작성한다.**
3. **GitHub repo:** https://github.com/gillettef/GameHub.git 의 `games/magicacademy/` (모노레포, 옛 개별 저장소 `gillettef/MagicAcademy` 는 2026-11-25 삭제) (기본 브랜치: `dev`). **일상 작업은 `dev`(기본 브랜치)에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.
4. **터미널/채팅 세션에서 사용자에게 보내는 응답은 항상 한국어로 작성한다.** (코드, 커밋 메시지, 식별자 등은 예외로 영어를 사용할 수 있다.)
5. **세션 대화는 가급적 한국어로 실시한다.** (작업 중 진행 상황 안내도 포함)

## 기술 스택 (2026-11-25 GameHub 공통 구조로 옮김)

새로운 기술 스택/라이브러리를 도입하기 전에는 사용자와 먼저 상의합니다. (GameHub `docs/refactor-plan.md` 3절의 승인이 지금 스택의 승인을 겸한다)

- TypeScript strict, React 19 + Vite, Tailwind CSS v4(공통 `@gamehub/ui/theme.css` 위에 `--gh-*` 색만 밝은 보라·분홍으로 바꾼다, `src/client/index.css`). 글꼴 Jua
- 공통 코드: `@gamehub/net`(방·진행·봇 예약·한 기기 `LocalGame`·온라인 `useRoom`), `@gamehub/ui`(HomeScreen·WaitingRoom·GameShell·PlayerStrip·Sheet)
- 서버: `server/app.ts` = `createRoomApp(def, { awayMs: null })`(Express 없음, `node:http` + `ws`). 빌드가 `server-dist/app.cjs` 한 파일로 묶고 허브가 `scripts/aws/hub-entry.mjs` 로 불러 실행한다(inproc, `http://54.116.67.196/magicacademy/`). DB 없음, 서버 재시작(배포) 시 진행 중인 방은 사라진다
- 테스트: Vitest(`test/`), 화면: Playwright WebKit(`e2e/mobile.mjs`). 린트·tsconfig·Vite 설정은 GameHub 루트 공통(`packages/config`). 단, 옛 엔진 코드를 그대로 두려고 `tsconfig.json` 에서 `noUncheckedIndexedAccess` 만 끈다
- 배포: `main` 병합 → GameHub `deploy.yml` → `deploy-magicacademy.yml`(공통 `deploy-workspace-game.yml`). CI 는 `ci-workspace.yml`

### 플레이 모드
1. **한 기기 봇 대전** — 처음 화면에서 인원(2~5)과 자리마다 사람/봇. 봇 이름은 옛 서버처럼 마루·별이…🤖
2. **돌려 하기** — 사람이 둘 이상이면 둘 사람이 바뀔 때 가림 화면("제가 ○○입니다 · 보기"). 장래희망·엿본 탐험 카드가 사람마다 비밀이라서
3. **봇끼리 관전** — 모든 자리를 봇으로. ≡ 메뉴에서 봇 속도(보통/빠르게, `magicacademy:botSpeed`, 진행 단계의 3초 기다림도 함께 빨라진다)
4. **온라인** — 방장이 방 만들기 → 4자리 코드·`?room=CODE` 초대 링크 → 대기실(빈자리를 봇으로) → 방장 시작, 남은 빈자리는 봇. 재접속은 서버가 좌석마다 준 토큰(`magicacademy:session`)으로 새로고침·끊김 뒤 같은 자리. **끊긴 사람의 차례는 봇이 대신하지 않고 기다린다**(옛 37절 그대로). 게임 중 나가면 그 자리는 봇이 이어받고 돌아올 수 없다. 아무도 보고 있지 않으면 진행이 멈춘다
5. **관전** — 방 코드로 들어와 공개 정보만(장래희망·엿본 카드는 아무 것도 안 보인다)
- 이어 하기: 한 기기 판은 행동 기록(`magicacademy:local`)을 저장해 두고 처음 화면의 "진행 중인 게임 이어 하기"로 돌아온다
- 옛 서버에만 있던 것(공통 방 코드에 없어 뺐다): 방장 내보내기(`kick_player`), 같은 멤버로 다시 하기(`rematch`, 한 기기는 "한 판 더"), 리액션 이모지, 방장 이양 알림

### 숨은 정보 (`src/def.ts` 의 `view`)
옛 서버 `broadcastGameState` 와 같다: 덱·버림 더미·주사위 처리 정보·시험 계획(`hidden`, `labPile`·`explorationPile`·`classDeck`·`classDiscard`·`creatureDeck`·`creatureDiscard`)은 보내지 않고, 남의 엿본 탐험 카드와 장래희망(끝나면 장래희망은 공개)을 가린다. 판의 난수 상태(`rng`)·봇 성향(`bots`)도 보내지 않는다.

### 디렉터리 구조
```
src/
  engine/      # 규칙 엔진(옛 server/src/game 그대로) — React·DOM·Math.random·Date.now 금지(ESLint)
    engine.ts  # 규칙: createGame, takeClassCard, selectActivity, submitRoll, confirmRoll … (판을 그 자리에서 바꾸고, 규칙 위반은 Error)
    config.ts  # 밸런스 수치·규칙 스위치(BALANCE). 지금 규칙 = 61절 라이트 + 62절 한 덱 + 63-3절 skillRules
    bot.ts     # 봇 판단(전략 AI 10종). autoplay.ts = 봇 한 차례(옛 app.ts takeAutoAction)
    action.ts  # 행동(Action) 타입·적용·지금 둘 사람(actorOf)
    record.ts  # 봇이 부르는 행동 함수(기록기로 봇의 수를 Action 으로 받는다)
    rng.ts     # 시드 난수(mulberry32)·카드 id(c1, c2 …)·학교 소식 id. withRng 로 판의 난수 상태를 묶는다
    publicRules.ts, types.ts, *Cards.ts, creatures.ts
  def.ts       # GameDef: 복제 후 적용·RuleError, 엄격한 parseAction, 좌석별 view, 진행 단계 3초 자동(clock), 봇(복제한 판에서 돌린 계획을 한 수씩)
  client/      # React 화면: App(처음·대기실·한 기기 가림 화면), GameScreen(GameShell 대국), GameBoard(단계별 패널·굴림), GameCard·CardArt(카드), Goals·PlayerTable·FinalReveal·Announcements·Rules
server/app.ts  # createRoomApp(def)
scripts/       # 밸런스 시뮬레이션(simulate·ai-league·fun-metrics 등, `npx tsx scripts/<이름>.ts`), aws/hub-entry.mjs
test/          # rules-check.ts(옛 규칙 검증 115개, rules.test.ts 가 돌린다), legacy.test.ts(+fixtures, 옛 서버와 같은 진행), def.test.ts
e2e/mobile.mjs # iPhone 화면 확인
cards/         # 카드 일러스트 원본(글자 없는 SVG) → public/cards/(메타데이터 제거본)
```

### 대국 화면 배치 (GameShell ①~⑤)
① 내 차례·누구 차례와 할 일, 개월·주차·이달의 소식 ② 친구 줄(학점, 주문력·지력·체력·매력; 누르면 그 친구의 카드) ③ 이달의 소식·지금 단계 패널(선 정하기·수업 카드·활동 카드·진행 순서·굴림)·다음 시험·최근 시험 결과·방금 일어난 일, 끝나면 졸업식 ④ 내 능력치·학점·노트·마법생물·장래희망(누르면 내 카드) ⑤ 주사위 굴리기 / 다시 굴리기·결과 확인 / 넘어가기 / 지목 취소 / 한 판 더·처음으로. ≡ 메뉴: 졸업 목표·친구들(비교표)·기록·규칙·봇 속도·나가기. 주차 알림(Announcements)은 버튼으로 넘기고, 한 기기에서는 떠 있는 동안 봇이 기다린다.

### 명령어 (게임 폴더에서. 설치는 GameHub 루트에서 `npm install` 한 번, 이 PC 에서는 `...\personal\GameHub` 표기 경로에서)
```
npm run dev        # vite --host. 화면과 온라인 방 서버(/ws)가 같은 포트로 함께 뜬다
npm run build      # vite build + server-dist/app.cjs
npm start          # 빌드 결과를 허브 방식으로 실행 → http://localhost:8080/magicacademy/
npm test           # vitest run
npm run typecheck
npm run e2e        # 빌드 결과를 iPhone 17 Pro 화면으로 모든 모드 확인, shots/*.png
```
커밋 전에는 GameHub 루트에서 `npm run check`(타입·린트·테스트·빌드)와 `npm run e2e`.

### 코딩 규칙
- 엔진은 시드 난수만(`src/engine/rng.ts`). 같은 시드·같은 행동이면 같은 판이어야 한다(`test/legacy.test.ts`). 규칙을 바꾸면 비교 기준(`test/fixtures/legacy-games.json`)도 다시 만들어야 한다 — 생성 스크립트는 저장소 밖(옛 엔진에 시드 난수를 넣어 봇끼리 12판을 두며 단계마다 해시를 남긴 것)
- 클라이언트는 절대경로를 쓰지 않는다(허브 `/magicacademy/` 아래). localStorage 키는 `magicacademy:` 접두어, try/catch
- 누르는 대상 44×44 이상, 페이지·가로 스크롤 없음(긴 내용은 ③·시트 안에서), 입력 16px 이상

## 세부 규칙

프로젝트가 진행되면서 사용자와의 대화를 통해 세부 규칙(코딩 컨벤션, 폴더 구조, 디자인 시스템, 테스트 전략 등)을 이 문서에 계속 추가해 나갑니다.

## 관련 문서 및 도구

- `.claude/agents/`: 이 프로젝트 전용 서브에이전트 (게임 규칙 검토, 모바일 UX 검토 등)
- `notes/플레이테스트_가이드.md`: 플레이테스트 실행 방법, 관찰 항목, 기록 양식, 수치 조정 지점
- `notes/공모전_검토.md`: 2027 코리아보드게임즈 공모전 검토(2026-10-14, 마감 2026-12-31). 규칙 아님
- 밸런스 도구(`npx tsx scripts/<이름>.ts`): `ai-league.ts`(전략 AI 10종 리그, `SEED`로 운 맞추기, 61절), `simulate.ts`, `fun-metrics.ts`(컨셉·밸런스·재미 지표, 45절), `stat-value.ts`·`starter-stats.ts`·`card-usage.ts`·`token-stats.ts`. 밸런스 수치는 `src/engine/config.ts`. 스크립트는 기본 고정 시드라 실행마다 같은 결과다
- 카드 일러스트: 카드 이름→파일 매핑은 `src/client/cardImages.ts`(카드 이름을 바꾸면 여기도 갱신)
- `.claude/skills/commit-and-push/`(커밋/푸시), `.claude/skills/dev/`·`dev-stop/`(서버 + Cloudflare 퀵 터널, 상태는 `.dev/`)
