# RETROCAUSE (레트로코즈)

3~5인 추리·블러핑 보드게임. 핵심 메커니즘은 **역인과**다. 게임은 **결말**에서 시작하고, 플레이어는 시간을 거슬러 그 결말로 이어지는 **원인**을 끼워 넣는다. 각자 비밀 목표에 유리한 인과를 만들되, 이미 놓인 사실과 모순되면 **패러독스**를 받는다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 디지털판(규칙 엔진·봇·웹 게임)은 GameHub 공통 기술스택(TypeScript, React, `@gamehub/net`·`@gamehub/ui`)으로 만든다. 룰의 기준은 항상 `rules/rulebook.md`다.

## 핵심 디자인 기둥 (변경 시 사용자 확인 필수)

> 초기 제안이다. 사용자 확인 전까지 관련 결정은 `가안`으로 둔다.

1. **결말은 고정, 원인은 자유.** 게임 시작 시 공개된 결말 카드는 절대 바뀌지 않는다. 플레이어가 바꿀 수 있는 것은 그 결말에 이르는 과정뿐이다.
2. **모순 판정은 기계적이어야 한다.** 스토리텔링 게임이지만 판정은 카드의 아이콘과 조건으로 결정한다. 플레이어 토론이나 심판이 필요한 판정은 만들지 않는다.
3. **퍼즐과 블러핑이 함께 간다.** "어떻게든 이 결과로 이어지게" 만드는 퍼즐 위에, 남의 비밀 목표를 추리하고 내 목표를 숨기는 심리전을 얹는다.
4. **3~5인, 30~45분.** 비밀 목표 간 견제가 생기려면 3인 이상이 필요하다.

## 폴더 구조

```
games/retrocause/
├── CLAUDE.md
├── docs/                # concept.md(개요) · decisions.md(결정 로그 D-001…) · glossary.md(용어집) · contest.md
├── rules/rulebook.md    # 룰북 초안 (규칙의 단일 기준, 화면의 '전체 룰북'이 그대로 보여 준다)
├── components/          # 구성물 목록과 사양 (카드 표는 src/engine/cards.ts 와 일치해야 한다, 테스트가 검사)
├── playtests/           # 플레이테스트 기록 (YYYY-MM-DD-NN.md)
├── src/
│   ├── engine/          # 순수 TS 규칙: cards.ts(카드 세트 v0) · engine.ts(판정·진행·득점) · bots.ts(봇·추리 봇) · view.ts(좌석 정보)
│   ├── def.ts           # 공통 방·진행 코드(@gamehub/net)에 엔진을 잇는 GameDef. 놓기 → 동시 추리 → 득점, 좌석별로 가린 view
│   ├── describe.ts      # 기록 한 줄(서버 방 기록과 화면 공용)
│   └── client/          # React 화면: 처음, 대국(Table·Timeline), 추리·결과, 돌려 하기 가림막, 규칙 요약·전체 룰북
├── public/              # 아이콘·manifest
├── server/app.ts        # 온라인 대전 서버(createRoomApp(def), WebSocket /ws)
├── scripts/aws/hub-entry.mjs  # 허브 안 실행 진입점
├── tools/sim.ts         # 봇 대전 통계 (npm run sim -- --games 500 --players 3,4,5 --style mixed)
├── test/                # vitest. legacy.test.ts 는 옛 JS 엔진과 같은 진행인지 기록(fixtures/)으로 비교한다
└── e2e/mobile.mjs       # iPhone 17 Pro 화면 확인(Playwright WebKit)
```

- 엔진의 import 는 `.ts` 확장자를 붙인다. 엔진은 시간·전역 난수를 쓰지 않는다(시드와 rng 를 늘 넘긴다).
- 숨은 정보(각자의 손패·비밀 목표, 덱 순서, 결과 전의 추리, 셔플 시드)는 `def.view` 가 좌석마다 거른다. 버린 카드는 룰북대로 공개라 기록에 남는다. 이 원칙은 `test/def.test.ts` 가 지킨다.
- 시작 플레이어는 시드로 정한다(룰북 3장 14번, 방의 1번 자리가 늘 먼저가 아니다). 봇 자리는 추리 단계에 들어가며 바로 추리한다.
- 규칙을 바꾸면 `legacy.test.ts` 가 깨지는 것이 정상이므로, 그때는 비교 기록을 지우고 그 사실을 결정 로그에 남긴다. 룰북 예시를 바꾸면 `test/engine.test.ts` 도 고친다.
- 명령(GameHub 루트에서 `npm install` 후, 이 폴더에서): `npm run dev`(화면+서버) · `npm test` · `npm run e2e`(빌드 후) · `npm run sim`.
- 바로 시작 링크: `?play=3|4|5`(나 vs 봇), `?room=ABCD`(온라인 초대). 한 기기 판은 `retrocause:local` 에 저장해 새로고침해도 이어진다.

## 작업 규칙

- **결정은 기록한다.** 규칙을 정하거나 바꾸면 `/design-log` 스킬로 `docs/decisions.md`에 남긴다. 되돌린 결정도 지우지 말고 "폐기" 상태로 둔다.
- **룰 문장은 `/write-rules` 스킬의 규칙을 따른다.** 하나의 문장에는 하나의 규칙만 쓰고, 용어는 용어집과 정확히 일치시킨다.
- **새 용어는 용어집에 먼저 추가한다.** 같은 개념에 두 개의 이름을 쓰지 않는다.
- **룰을 크게 바꾼 뒤에는 검증한다.** `rules-reviewer` 에이전트로 모순과 빈틈을 찾고, `playtest-simulator` 에이전트로 가상 플레이를 돌려본다.
- **수치는 근거와 함께 쓴다.** 밸런스 수치를 바꿀 때는 `balance-analyst` 에이전트의 분석이나 플레이테스트 결과를 근거로 남긴다.
- 기존 게임의 이름, 캐릭터, 아트, 고유 규칙 문구를 베끼지 않는다. 장르적 메커니즘 참고는 괜찮다.

## Git 규칙

- **저장소:** https://github.com/gillettef/GameHub.git 의 `games/retrocause/` (모노레포, 옛 개별 저장소 `gillettef/Retrocause` 는 2026-11-25 삭제) (기본 브랜치: `dev`)
- **작은 작업 단위가 끝날 때마다 반드시 commit하고 push한다.** 여러 작업을 모아서 한 번에 올리지 않는다. `/commit-push` 스킬을 쓴다. (이 규칙은 커밋·푸시에 대한 사전 승인이다. 단, force push·히스토리 변경은 사용자에게 먼저 확인한다.)
- **commit 메시지는 한국어로 쓴다.** 형식은 `/commit-push` 스킬을 따른다. (예: `규칙: 원인 카드 배치 단계 문장 정리`)
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- 운영은 GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs`). 접속은 `http://54.116.67.196/retrocause/`.
- `main` 병합 때 GameHub `deploy.yml` → `deploy-retrocause.yml` → 공통 `deploy-workspace-game.yml` 이 검사·빌드를 통과한 산출물(`dist`, `server-dist`, `scripts/aws`)만 `~/retrocause` 에 올리고 허브(`gamehub`)를 재시작한다. 재시작하면 모든 게임의 진행 중인 방이 사라진다. 수동 재배포는 Actions → Deploy retrocause.
- 온라인 대전은 공통 `@gamehub/net` 방식이다: 대기실 → 방장 시작(빈자리는 봇), 끊긴 사람의 차례·추리는 45초 뒤 봇이 대신, 게임 중 나가면 그 자리는 봇이 이어받는다(`docs/refactor-plan.md` 9절).
- 예전 단독 운영(포트 8100, systemd `retrocause`, SSE API, 수동 배포 스크립트 `deploy-aws.ps1`)은 2026-11-25 새 구조로 옮기며 없앴다.

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `rules-reviewer` | 룰북의 모순, 모호함, 미정의 상황, 용어 불일치 검수 |
| `playtest-simulator` | 현재 룰로 3~4인 가상 플레이를 진행하고 막히는 지점과 재미 요소 보고 |
| `balance-analyst` | 차례 순서 유불리, 비밀 목표 난이도, 지배 전략, 수치 밸런스 분석 |

## 스킬

| 스킬 | 용도 |
|---|---|
| `/design-log` | 디자인 결정을 `docs/decisions.md`에 기록 |
| `/write-rules` | 룰북 작성·수정 시 문장 규칙과 구조 |
| `/playtest-report` | 플레이테스트(실제 또는 가상) 결과를 `playtests/`에 기록 |
| `/commit-push` | 한국어 메시지로 커밋하고 `dev`에 푸시 |
