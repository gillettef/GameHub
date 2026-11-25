# LIGHTCONE (라이트콘)

2인 성간 대결 보드게임. 핵심 메커니즘은 **빛의 속도 지연**이다. 상대는 언제나 내 **과거**를 보고 판단하며, 나는 그 점을 역이용한다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 디지털판(웹 게임)은 `src/`의 TypeScript·React 코드다. 룰의 기준은 항상 `rules/rulebook.md`다.

## 핵심 디자인 기둥 (변경 시 사용자 확인 필수)

1. **지연은 눈에 보여야 한다.** 기록지 계산이 아니라 보드 위 부품의 움직임(잔상, 파문)으로 지연을 표현한다.
2. **예측형 심리전이 중심, 추리형이 보조다.** "상대가 내 과거를 보고 움직인다"는 사실을 이용해 함정을 파는 재미가 핵심이다.
3. **2인 전용, 45~60분.** 관찰자 문제(플레이어마다 다른 지연)를 피하기 위해 2인으로 고정한다.
4. **"빛이 도착했을 때 이미 끝나 있는" 승리.** 승리 조건은 지연을 이용한 기습과 선점을 보상해야 한다.

## 폴더 구조

```
games/lightcone/
├── CLAUDE.md
├── docs/                # concept.md(개요) · decisions.md(결정 로그 D-001…) · glossary.md(용어집)
├── rules/rulebook.md    # 룰북 초안 (규칙의 단일 기준)
├── components/          # 구성물 목록과 사양
├── playtests/           # 플레이테스트 기록 (YYYY-MM-DD-NN.md)
├── src/
│   ├── engine/          # 순수 TS 규칙: map.ts(지도·수치) · engine.ts(단계 처리·보기) · bot.ts(봇, 공개 정보만 씀)
│   ├── def.ts           # 공통 방·진행 코드(@gamehub/net)에 엔진을 잇는 GameDef. 두 사람이 단계마다 동시에 비밀로 낸다
│   └── client/          # React 화면: 처음, 대국(Table·Board·Hand), 기기 넘기기, 봇 실체 보기, 결과·실제 경로, 규칙 요약
├── public/              # 아이콘·manifest
├── server/app.ts        # 온라인 대전 서버(createRoomApp(def), WebSocket /ws)
├── scripts/aws/hub-entry.mjs  # 허브 안 실행 진입점
├── scripts/pnp/         # 출력용 PDF 생성기(reportlab). 결과는 print/(저장소에는 없음)
├── test/                # vitest. legacy.test.ts 는 옛 JS 엔진과 같은 진행인지 기록(fixtures/)으로 비교한다
└── e2e/mobile.mjs       # iPhone 17 Pro 화면 확인(Playwright WebKit)
```

- 웹 게임 규칙은 룰북을 따라야 한다. 룰북을 바꾸면 `src/engine/engine.ts`·`map.ts`와 테스트도 함께 고친다. 규칙을 바꾸면 `legacy.test.ts` 가 깨지는 것이 정상이므로, 그때는 비교 기록을 지우고 그 사실을 결정 로그에 남긴다.
- 엔진의 import 는 `.ts` 확장자를 붙인다. 엔진은 시간·난수를 직접 쓰지 않는다(시드·rng 는 부르는 쪽이 준다).
- 숨길 정보: `def.ts` 의 `view` 는 좌석마다 자기 함대·컨베이어 전부와 상대의 잔상·파문 칸별 장수·남은 위장 수·공개 기록만 보낸다. 먼저 낸 행동(pending)·시드는 보내지 않는다. 관전자는 양쪽 공개 정보만 본다. 게임이 끝나면 실체·실제 경로를 공개한다.
- 명령(GameHub 루트에서 `npm install` 후, 이 폴더에서): `npm run dev`(화면+서버) · `npm test` · `npm run e2e`(빌드 후).
- 바로 시작 링크: `?play=bot`(나 vs 봇), `?room=ABCD`(온라인 초대). 처음 화면에서 한 기기 두 사람(차례마다 기기 넘기기), 봇끼리 관전도 고를 수 있다.

## 작업 규칙

- **결정은 기록한다.** 규칙을 정하거나 바꾸면 `/design-log` 스킬로 `docs/decisions.md`에 남긴다. 되돌린 결정도 지우지 말고 "폐기" 상태로 둔다.
- **룰 문장은 `/write-rules` 스킬의 규칙을 따른다.** 하나의 문장에는 하나의 규칙만 쓰고, 용어는 용어집과 정확히 일치시킨다.
- **새 용어는 용어집에 먼저 추가한다.** 같은 개념에 두 개의 이름을 쓰지 않는다.
- **룰을 크게 바꾼 뒤에는 검증한다.** `rules-reviewer` 에이전트로 모순과 빈틈을 찾고, `playtest-simulator` 에이전트로 가상 플레이를 돌려본다.
- **수치는 근거와 함께 쓴다.** 밸런스 수치를 바꿀 때는 `balance-analyst` 에이전트의 분석이나 플레이테스트 결과를 근거로 남긴다.
- 기존 게임의 이름, 캐릭터, 아트, 고유 규칙 문구를 베끼지 않는다. 장르적 메커니즘 참고는 괜찮다.

## Git 규칙

- **저장소:** https://github.com/gillettef/GameHub.git 의 `games/lightcone/` (모노레포, 옛 개별 저장소 `gillettef/Lightcone` 는 2026-11-25 삭제) (기본 브랜치: `dev`)
- **작은 작업 단위가 끝날 때마다 반드시 commit하고 push한다.** 여러 작업을 모아서 한 번에 올리지 않는다. `/commit-push` 스킬을 쓴다. (이 규칙은 커밋·푸시에 대한 사전 승인이다. 단, force push·히스토리 변경은 사용자에게 먼저 확인한다.)
- **commit 메시지는 한국어로 쓴다.** 형식은 `/commit-push` 스킬을 따른다. (예: `규칙: 잔상 이동 단계 문장 정리`)
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- 운영은 GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs`). 접속은 `http://54.116.67.196/lightcone/`.
- `main` 병합 때 GameHub `deploy.yml` → `deploy-lightcone.yml` → 공통 `deploy-workspace-game.yml` 이 검사·빌드를 통과한 산출물(`dist`, `server-dist`, `scripts/aws`)만 `~/lightcone` 에 올리고 허브(`gamehub`)를 재시작한다. 재시작하면 모든 게임의 진행 중인 방이 사라진다. 수동 재배포는 Actions → Deploy lightcone.
- 온라인 대전은 공통 `@gamehub/net` 방식이다: 대기실 → 방장 시작(빈자리는 봇), 끊긴 사람의 단계는 45초 뒤 봇이 대신 낸다, 게임 중 나가면 그 자리는 봇이 이어받는다(`docs/refactor-plan.md` 9절). 판이 끝난 뒤 같은 방에서 다시 하기는 없다.
- 예전 단독 운영(포트 8099, systemd `lightcone`, SSE API, 수동 배포 스크립트)은 2026-11-25 새 구조로 옮기며 없앴다.

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `rules-reviewer` | 룰북의 모순, 모호함, 미정의 상황, 용어 불일치 검수 |
| `playtest-simulator` | 현재 룰로 2인 가상 플레이를 진행하고 막히는 지점과 재미 요소 보고 |
| `balance-analyst` | 선/후공 유불리, 지배 전략, 수치 밸런스 분석 |

## 스킬

| 스킬 | 용도 |
|---|---|
| `/design-log` | 디자인 결정을 `docs/decisions.md`에 기록 |
| `/write-rules` | 룰북 작성·수정 시 문장 규칙과 구조 |
| `/playtest-report` | 플레이테스트(실제 또는 가상) 결과를 `playtests/`에 기록 |
| `/commit-push` | 한국어 메시지로 커밋하고 `dev`에 푸시 |
