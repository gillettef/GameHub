# CREASE (크리스)

2~4인 경주·영역 보드게임. 핵심 메커니즘은 **접는 보드**다. 플레이어는 경첩으로 이어진 보드를 **실제로 접어** 멀리 떨어진 칸끼리 겹치게 만들고, 겹친 칸 사이를 한 걸음에 건너뛴다. 접힌 동안 가려진 칸의 말과 토큰은 **부재** 상태가 되어 잠시 판에서 사라진다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 디지털 구현(규칙 엔진·봇·밸런스 시뮬레이터·웹 게임)은 GameHub 공통 구조(`packages/example`, `docs/refactor-plan.md`)를 따른다. 룰의 기준은 항상 `rules/rulebook.md`이고, 엔진은 그 구현이다.

## 핵심 디자인 기둥 (변경 시 사용자 확인 필수)

> 초기 제안이다. 사용자 확인 전까지 관련 결정은 `가안`으로 둔다.

1. **접기는 손으로 한다.** 공간 왜곡은 카드나 표시물로 흉내 내지 않는다. 플레이어가 보드를 실제로 접고, 겹친 결과를 눈으로 확인하는 촉각적 놀라움이 이 게임의 중심이다.
2. **겹침 판정은 기계적이어야 한다.** 접힌 모양이 조금 어긋나도 판정은 칸 좌표와 접기 선의 대응 규칙으로 결정한다. 플레이어가 "겹친 것 같다"를 두고 다투는 판정은 만들지 않는다.
3. **한 번의 접기가 판을 뒤집되, 잃는 것은 없다.** 접기는 길을 열고 상대를 가리는 강한 행동이다. 그러나 가려진 말과 토큰은 제거되지 않고, 펼치면 원래 칸으로 돌아온다.
4. **2~4인, 30~45분.** 접기 하나의 영향이 판 전체에 미치므로 인원이 많으면 차례 사이 변화가 너무 커진다. 다운타임이 짧은 규모로 유지한다.

## 폴더 구조

```
games/crease/
├── CLAUDE.md
├── docs/                # concept.md(개요) · decisions.md(결정 로그) · glossary.md(용어집) · balance.md(밸런스 측정)
├── rules/rulebook.md    # 룰북 초안 (규칙의 단일 기준)
├── components/          # 구성물 목록과 사양
├── src/
│   ├── engine/          # 순수 TS 규칙: engine.ts(판·차례) · rules.ts(확정 수치 RULES) · bot.ts(봇) · sim.ts(일괄 시뮬레이션)
│   ├── def.ts           # 공통 방·진행 코드(@gamehub/net)에 엔진을 잇는 GameDef. 행동 = 걸음 1칸·접기·펼치기·차례 끝
│   └── client/          # React 화면: 처음, 대국(Table·Board), 봇 대전 관전, 밸런스 시뮬레이션, 규칙 요약
├── server/app.ts        # 온라인 대전 서버(createRoomApp(def), WebSocket /ws)
├── scripts/aws/hub-entry.mjs  # 허브 안 실행 진입점
├── tools/               # 밸런스 CLI(sim·grid·endcause·search3·search4)와 설명 그림(make-figure)
├── test/                # vitest. legacy.test.ts 는 옛 JS 엔진과 같은 진행인지 기록(fixtures/)으로 비교한다
└── e2e/mobile.mjs       # iPhone 17 Pro 화면 확인(Playwright WebKit)
```

- 엔진·도구의 import 는 `.ts` 확장자를 붙인다(`node --experimental-strip-types` 로 바로 실행).
- 규칙 수치를 바꾸면 `src/engine/rules.ts` 와 룰북 3장 표를 함께 고친다(`test/rulebook-sync.test.ts`). 규칙을 바꾸면 `legacy.test.ts` 가 깨지는 것이 정상이므로, 그때는 비교 기록을 지우고 그 사실을 결정 로그에 남긴다.
- 명령(GameHub 루트에서 `npm install` 후, 이 폴더에서): `npm run dev`(화면+서버) · `npm test` · `npm run e2e`(빌드 후) · `npm run sim -- --games 300 --players 3` · `npm run figure`.
- 바로 시작 링크: `?play=3`(나 vs 봇 3인), `?watch=4`(봇 4인 관전), `?room=ABCD`(온라인 초대).

## 작업 규칙

- **결정은 기록한다.** 규칙을 정하거나 바꾸면 `/design-log` 스킬로 `docs/decisions.md`에 남긴다. 되돌린 결정도 지우지 말고 "폐기" 상태로 둔다.
- **룰 문장은 `/write-rules` 스킬의 규칙을 따른다.** 하나의 문장에는 하나의 규칙만 쓰고, 용어는 용어집과 정확히 일치시킨다.
- **새 용어는 용어집에 먼저 추가한다.** 같은 개념에 두 개의 이름을 쓰지 않는다.
- **룰을 크게 바꾼 뒤에는 검증한다.** `rules-reviewer` 에이전트로 모순과 빈틈을 찾고, `playtest-simulator` 에이전트로 가상 플레이를 돌려본다.
- **수치는 근거와 함께 쓴다.** 밸런스 수치를 바꿀 때는 `balance-analyst` 에이전트의 분석이나 플레이테스트 결과를 근거로 남긴다.
- **물리 구성물의 제약을 함께 기록한다.** 규칙이 접기 횟수, 패널 두께, 말 고정 방식에 기대면 `components/components.md`에도 그 제약을 적는다.
- 기존 게임의 이름, 캐릭터, 아트, 고유 규칙 문구를 베끼지 않는다. 장르적 메커니즘 참고는 괜찮다.

## Git 규칙

- **저장소:** https://github.com/gillettef/GameHub.git 의 `games/crease/` (모노레포, 옛 개별 저장소 `gillettef/Crease` 는 2026-11-25 삭제) (기본 브랜치: `dev`)
- **작은 작업 단위가 끝날 때마다 반드시 commit하고 push한다.** 여러 작업을 모아서 한 번에 올리지 않는다. `/commit-push` 스킬을 쓴다. (이 규칙은 커밋·푸시에 대한 사전 승인이다. 단, force push·히스토리 변경은 사용자에게 먼저 확인한다.)
- **commit 메시지는 한국어로 쓴다.** 형식은 `/commit-push` 스킬을 따른다. (예: `규칙: 접기 단계 문장 정리`)
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- 운영은 GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs`). 접속은 `http://54.116.67.196/crease/`.
- `main` 병합 때 GameHub `deploy.yml` → `deploy-crease.yml` → 공통 `deploy-workspace-game.yml` 이 검사·빌드를 통과한 산출물(`dist`, `server-dist`, `scripts/aws`)만 `~/crease` 에 올리고 허브(`gamehub`)를 재시작한다. 재시작하면 모든 게임의 진행 중인 방이 사라진다. 수동 재배포는 Actions → Deploy crease.
- 온라인 대전은 공통 `@gamehub/net` 방식이다: 대기실 → 방장 시작(빈자리는 봇), 끊긴 사람의 차례는 45초 뒤 봇이 대신, 게임 중 나가면 그 자리는 봇이 이어받는다(`docs/refactor-plan.md` 9절).
- 예전 단독 운영(포트 8101, systemd `crease`, SSE API)은 2026-11-25 새 구조로 옮기며 없앴다.

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `rules-reviewer` | 룰북의 모순, 모호함, 미정의 상황(특히 겹침·부재 판정), 용어 불일치 검수 |
| `playtest-simulator` | 현재 룰로 2~4인 가상 플레이를 진행하고 막히는 지점과 재미 요소 보고 |
| `balance-analyst` | 차례 순서 유불리, 접기 선별 가치, 지배 전략, 수치 밸런스 분석 |

## 스킬

| 스킬 | 용도 |
|---|---|
| `/design-log` | 디자인 결정을 `docs/decisions.md`에 기록 |
| `/write-rules` | 룰북 작성·수정 시 문장 규칙과 구조 |
| `/playtest-report` | 플레이테스트(실제 또는 가상) 결과를 `playtests/`에 기록 |
| `/commit-push` | 한국어 메시지로 커밋하고 `dev`에 푸시 |
