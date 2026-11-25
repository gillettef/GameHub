# HEARSAY (히어세이)

4~6인 기억·정치·블러핑 보드게임. 핵심 메커니즘은 **집단 기억으로 역사 정하기**다. 보드에 놓인 기록은 시간이 지나면 뒤집혀 **망각 더미**에 섞여 **물리적으로 사라진다**. 나중에 "3계절에 강가 땅은 누구 것이었나?"가 점수를 가를 때 확인할 방법은 없다. 플레이어는 각자 기억을 **증언**하고, 다수의 증언이 **공식 역사**가 된다. 거짓 증언으로 역사를 조작할 수도 있다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 디지털 구현(규칙 엔진·봇·웹 게임)은 GameHub 공통 구조(`packages/example`, `docs/refactor-plan.md`)를 따른다. 봇 대전·한 기기 돌려 하기·온라인 실시간 대전·관전을 제공한다. 룰의 기준은 항상 `rules/rulebook.md`이며, 룰을 바꾸면 `src/engine/*.ts`와 테스트도 함께 고친다.
- 진행 쪽(온라인은 서버, 한 기기는 브라우저의 Match)이 권위를 가진다. 망각된 칸의 진실은 엔진에서도 지우고, `def.view` 는 좌석마다 볼 수 있는 것만 보낸다(남이 고른 구역 카드·쥔 증언 토큰·회상 카드 순서·난수·봇의 기억은 가린다). 지난 기록·채팅 로그를 화면에 남기지 않는다(공통 기록에 아무것도 쓰지 않는다, 말은 20초 뒤 사라진다).
- 명령(GameHub 루트에서 `npm install` 후, 이 폴더에서): `npm run dev`(화면+서버) · `npm test` · `npm run build` · `npm run e2e`(빌드 후).
- 바로 시작 링크: `?play=4|5|6`(나 vs 봇), `?room=ABCD`(온라인 초대). 한 기기 판은 저장하지 않는다(지난 행동을 남기면 망각된 진실을 되살릴 수 있다).

## 핵심 디자인 기둥 (변경 시 사용자 확인 필수)

> 2026-11-23 사용자가 4개 기둥을 모두 확정했다(D-005). 기둥을 바꾸려면 사용자 확인을 받는다.

1. **지워진 기록은 정말로 지워진다.** 망각된 정보는 어떤 수단으로도 다시 확인할 수 없다. 메모, 사진, 되짚어 보기를 금지하고, 구성물도 진실을 복원할 단서를 남기지 않게 만든다.
2. **진실이 아니라 합의가 점수가 된다.** 득점은 실제로 일어난 일이 아니라 공식 역사를 기준으로 한다. 한번 공식 역사가 된 내용은 게임 끝까지 바뀌지 않는다.
3. **기억은 자유, 절차는 기계적.** 무엇을 증언할지는 각자의 기억과 속셈에 맡기지만, 증언 공개·집계·동점 처리는 토론 없이 결론이 나는 절차로 정한다.
4. **4~6인, 45~60분.** 다수결이 정치가 되려면 연합과 배신이 가능한 4인 이상이 필요하다.

## 폴더 구조

```
games/hearsay/
├── CLAUDE.md
├── docs/                # concept.md(개요) · decisions.md(결정 로그) · glossary.md(용어집)
├── rules/rulebook.md    # 룰북 초안 (규칙의 단일 기준)
├── components/          # 구성물 목록과 사양, print-and-play
├── playtests/           # 플레이테스트 기록 (YYYY-MM-DD-NN.md)
├── src/
│   ├── engine/          # 순수 TS 규칙: rules.ts(수치) · game.ts(상태·진행·좌석별 view) · bot.ts(불완전한 기억의 봇) · random.ts
│   ├── def.ts           # 공통 방·진행 코드(@gamehub/net)에 엔진을 잇는 GameDef. 실시간 시계(def.clock), 좌석별로 가린 view, 봇·대리 진행
│   └── client/          # React 화면: 처음, 대국(Table), 돌려 하기 가림막, 규칙 요약
├── public/              # 아이콘·manifest
├── server/app.ts        # 온라인 대전 서버(createRoomApp(def), WebSocket /ws)
├── scripts/aws/hub-entry.mjs  # 허브 안 실행 진입점
├── test/                # vitest. legacy.test.ts 는 옛 JS 엔진과 같은 진행인지 기록(fixtures/)으로 비교한다
└── e2e/mobile.mjs       # iPhone 17 Pro 화면 확인(Playwright WebKit)
```

- 엔진의 import 는 `.ts` 확장자를 붙인다. 엔진은 시간을 직접 읽지 않고 `now` 를 받는다. def 의 `Table.now` 가 진행 쪽 시계다.
- 규칙을 바꾸면 `legacy.test.ts` 가 깨지는 것이 정상이므로, 그때는 비교 기록을 지우고 그 사실을 결정 로그에 남긴다.
- 봇은 공통 진행 코드가 `def.bot.delayMs`(1.5초) 간격으로 한 좌석씩 둔다. 속삭임에서는 봇이 모두 말한 뒤, 시작 9초가 지나야 주먹을 내민다(`BOT_FIST_AFTER_MS`).

## 작업 규칙

- **결정은 기록한다.** 규칙을 정하거나 바꾸면 `/design-log` 스킬로 `docs/decisions.md`에 남긴다. 되돌린 결정도 지우지 말고 "폐기" 상태로 둔다.
- **룰 문장은 `/write-rules` 스킬의 규칙을 따른다.** 하나의 문장에는 하나의 규칙만 쓰고, 용어는 용어집과 정확히 일치시킨다.
- **새 용어는 용어집에 먼저 추가한다.** 같은 개념에 두 개의 이름을 쓰지 않는다.
- **룰을 크게 바꾼 뒤에는 검증한다.** `rules-reviewer` 에이전트로 모순과 빈틈을 찾고, `playtest-simulator` 에이전트로 가상 플레이를 돌려본다.
- **수치는 근거와 함께 쓴다.** 밸런스 수치를 바꿀 때는 `balance-analyst` 에이전트의 분석이나 플레이테스트 결과를 근거로 남긴다.
- 기존 게임의 이름, 캐릭터, 아트, 고유 규칙 문구를 베끼지 않는다. 장르적 메커니즘 참고는 괜찮다.

## Git 규칙

- **저장소:** https://github.com/gillettef/GameHub.git 의 `games/hearsay/` (모노레포, 옛 개별 저장소 `gillettef/Hearsay` 는 2026-11-25 삭제) (기본 브랜치: `dev`)
- **작은 작업 단위가 끝날 때마다 반드시 commit하고 push한다.** 여러 작업을 모아서 한 번에 올리지 않는다. `/commit-push` 스킬을 쓴다. (이 규칙은 커밋·푸시에 대한 사전 승인이다. 단, force push·히스토리 변경은 사용자에게 먼저 확인한다.)
- **commit 메시지는 한국어로 쓴다.** 형식은 `/commit-push` 스킬을 따른다. (예: `규칙: 증언 동시 공개 단계 문장 정리`)
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- 운영은 GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs`). 접속은 `http://54.116.67.196/hearsay/`.
- `main` 병합 때 GameHub `deploy.yml` → `deploy-hearsay.yml` → 공통 `deploy-workspace-game.yml` 이 검사·빌드를 통과한 산출물(`dist`, `server-dist`, `scripts/aws`)만 `~/hearsay` 에 올리고 허브(`gamehub`)를 재시작한다. 재시작하면 모든 게임의 진행 중인 방이 사라진다. 수동 재배포는 Actions → Deploy hearsay.
- 온라인 대전은 공통 `@gamehub/net` 방식이다: 대기실 → 방장 시작(빈자리는 봇), 끊긴 사람의 할 일은 45초 뒤 대리(봇)가 대신, 게임 중 나가면 그 자리는 봇이 이어받는다, 아무도 보고 있지 않으면 시계와 봇이 멈춘다(`docs/refactor-plan.md` 9절).
- 예전 단독 운영(포트 8103, systemd `hearsay`, SSE API, 수동 배포 스크립트)은 2026-11-25 새 구조로 옮기며 없앴다.

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `rules-reviewer` | 룰북의 모순, 모호함, 미정의 상황, 용어 불일치, 정보 복원 구멍 검수 |
| `playtest-simulator` | 현재 룰로 4~5인 가상 플레이를 진행하되, 가상 플레이어의 불완전한 기억을 모사하고 막히는 지점과 재미 요소 보고 |
| `balance-analyst` | 거짓 증언의 기대값, 연합 규모, 기억력 격차, 지배 전략, 수치 밸런스 분석 |

## 스킬

| 스킬 | 용도 |
|---|---|
| `/design-log` | 디자인 결정을 `docs/decisions.md`에 기록 |
| `/write-rules` | 룰북 작성·수정 시 문장 규칙과 구조 |
| `/playtest-report` | 플레이테스트(실제 또는 가상) 결과를 `playtests/`에 기록 |
| `/commit-push` | 한국어 메시지로 커밋하고 `dev`에 푸시 |
