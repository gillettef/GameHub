# LASTGRAIN (라스트그레인)

2인 실시간·턴제 혼합 전술 보드게임. 핵심 메커니즘은 **수명이 붙은 말**이다. 모든 **모래병**에는 작은 실물 **모래시계**가 꽂혀 있고, 마지막 모래알이 떨어지면 그 모래병은 **소멸**한다. 게임은 차례제로 진행하지만 모래는 실시간으로 흐르므로, 오래 고민할수록 내 군대가 줄어든다. 모래시계를 **뒤집기**하면 수명을 되살릴 수 있지만, 남은 시간과 지난 시간이 **역전**된다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 웹 게임(봇 대전·온라인 실시간 대전)은 GameHub 공통 구조(`packages/example`, `docs/refactor-plan.md`)를 따른다. 룰의 기준은 항상 `rules/rulebook.md`다. **룰북을 바꾸면 `src/engine/rules.ts`와 테스트도 같이 고친다.** 규칙을 바꾸면 `test/legacy.test.ts`(옛 JS 엔진과의 동일성 비교)가 깨지는 것이 정상이므로, 그때는 비교 기록을 지우고 결정 로그에 남긴다.

## 핵심 디자인 기둥 (변경 시 사용자 확인 필수)

> 초기 제안이다. 사용자 확인 전까지 관련 결정은 `가안`으로 둔다.

1. **남은 모래가 곧 생명이다.** 모래병의 체력과 수명은 모래시계 잔량 하나로만 표현한다. 체력 토큰이나 기록지 같은 보조 표시를 따로 두지 않는다.
2. **고민은 공짜가 아니다.** 차례제 게임이지만 시간은 실시간으로 흐른다. 생각하는 시간 자체가 내 군대를 깎는 비용이 되게 하여 장고를 막고 긴장감을 만든다.
3. **뒤집기는 양날의 검이다.** 뒤집기는 남은 시간을 지난 시간으로 바꾼다. 거의 빈 모래시계에는 회복이 되고, 거의 찬 모래시계에는 치명상이 된다. "언제 뒤집느냐"가 게임의 핵심 판단이다.
4. **2인 결투, 20~30분.** 실시간 압박이 지치지 않고 유지되는 짧은 길이를 목표로 한다. 본 규칙은 2인 전용이며, 4인 2:2 팀전은 룰북 부록의 변형 규칙으로만 둔다(D-005).

## 폴더 구조

```
Lastgrain/
├── CLAUDE.md
├── docs/
│   ├── concept.md       # 게임 개요, 핵심 경험, 열린 질문
│   ├── decisions.md     # 디자인 결정 로그 (D-001, D-002 ...)
│   └── glossary.md      # 공식 용어집
├── rules/
│   └── rulebook.md      # 룰북 초안 (규칙의 단일 기준)
├── components/
│   └── components.md    # 구성물 목록과 사양
├── playtests/           # 플레이테스트 기록 (YYYY-MM-DD-NN.md)
├── submission/          # 규칙서 HTML(빌드가 rules.html 로 복사)과 생성 스크립트
├── src/
│   ├── engine/          # 순수 TS 규칙: rules.ts(판·차례·tick), bot.ts(1수 앞 봇), random.ts
│   ├── def.ts           # 공통 방·진행 코드(@gamehub/net)에 잇는 GameDef. def.clock 이 실시간으로 모래를 흘린다
│   └── client/          # React 화면: App(처음·설정), Table(대국), Piece(모래병·모래시계)
├── server/app.ts        # 온라인 서버(createRoomApp(def), WebSocket /ws)
├── scripts/aws/hub-entry.mjs  # 허브 안 실행 진입점
├── public/              # 아이콘·매니페스트
├── test/                # vitest: rules.test.mjs(판정), legacy.test.ts(옛 엔진과 같은 진행, fixtures/), def.test.ts
└── e2e/mobile.mjs       # iPhone 17 Pro 화면 확인
```

- 빌드(`npm run build`)는 `submission/LASTGRAIN_규칙서.html` 을 `dist/rules.html` 로 함께 낸다(화면의 「규칙서」 링크).
- 실시간 처리: 판정은 진행 쪽 시계(온라인은 서버, 봇 대전은 브라우저의 Match)로 하고 1초마다 상태를 다시 보낸다. 화면은 받은 뒤 흐른 시간만큼 모래를 줄여 보여 줄 뿐이다(`Table.tsx` 의 `predict`). 온라인은 시작 전 3초를 센다.
- 명령(GameHub 루트에서 `npm install` 후 이 폴더에서): `npm run dev` · `npm test` · `npm run e2e`(빌드 후).

## 작업 규칙

- **결정은 기록한다.** 규칙을 정하거나 바꾸면 `/design-log` 스킬로 `docs/decisions.md`에 남긴다. 되돌린 결정도 지우지 말고 "폐기" 상태로 둔다.
- **룰 문장은 `/write-rules` 스킬의 규칙을 따른다.** 하나의 문장에는 하나의 규칙만 쓰고, 용어는 용어집과 정확히 일치시킨다.
- **새 용어는 용어집에 먼저 추가한다.** 같은 개념에 두 개의 이름을 쓰지 않는다.
- **룰을 크게 바꾼 뒤에는 검증한다.** `rules-reviewer` 에이전트로 모순과 빈틈을 찾고, `playtest-simulator` 에이전트로 가상 플레이를 돌려본다.
- **수치는 근거와 함께 쓴다.** 밸런스 수치(모래시계 길이, 뒤집기 횟수, 대모래시계 길이 등)를 바꿀 때는 `balance-analyst` 에이전트의 분석이나 플레이테스트 결과를 근거로 남긴다.
- 기존 게임의 이름, 캐릭터, 아트, 고유 규칙 문구를 베끼지 않는다. 장르적 메커니즘 참고는 괜찮다.

## Git 규칙

- **저장소:** https://github.com/gillettef/GameHub.git 의 `games/lastgrain/` (모노레포, 옛 개별 저장소 `gillettef/Lastgrain` 는 2026-11-25 삭제) (기본 브랜치: `dev`)
- **작은 작업 단위가 끝날 때마다 반드시 commit하고 push한다.** 여러 작업을 모아서 한 번에 올리지 않는다. `/commit-push` 스킬을 쓴다. (이 규칙은 커밋·푸시에 대한 사전 승인이다. 단, force push·히스토리 변경은 사용자에게 먼저 확인한다.)
- **commit 메시지는 한국어로 쓴다.** 형식은 `/commit-push` 스킬을 따른다. (예: `규칙: 뒤집기 단계 문장 정리`)
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- 운영은 GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs`). 접속은 `http://54.116.67.196/lastgrain/`.
- `main` 병합 때 GameHub `deploy.yml` → `deploy-lastgrain.yml` → 공통 `deploy-workspace-game.yml` 이 검사·빌드를 통과한 산출물(`dist`, `server-dist`, `scripts/aws`)만 `~/lastgrain` 에 올리고 허브(`gamehub`)를 재시작한다. 재시작하면 모든 게임의 진행 중인 방이 사라진다. 수동 재배포는 Actions → Deploy lastgrain.
- 온라인 대전은 공통 방식이다: 방 코드 4자리, 대기실 → 방장 시작(빈자리는 봇), 1번 자리가 선. 끊긴 사람의 차례는 45초 뒤 봇이 대신하고(그동안 그 사람의 모래는 계속 흐른다), 게임 중 나가면 그 자리는 봇이 이어받는다(GameHub `docs/refactor-plan.md` 9절).
- 예전 단독 운영(포트 8104, systemd `lastgrain`, SSE API `scripts/aws/online.mjs`)은 2026-11-25 새 구조로 옮기며 없앴다.

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `rules-reviewer` | 룰북의 모순, 모호함, 미정의 상황(특히 실시간 판정 시점), 용어 불일치 검수 |
| `playtest-simulator` | 현재 룰로 2인 가상 플레이를 진행하며 차례별 고민 시간과 모래시계 잔량을 추적하고, 막히는 지점과 재미 요소 보고 |
| `balance-analyst` | 모래시계 길이별 모래병 가치, 뒤집기 기대값, 고민 시간의 비용, 차례 순서 유불리, 지배 전략 분석 |

## 스킬

| 스킬 | 용도 |
|---|---|
| `/design-log` | 디자인 결정을 `docs/decisions.md`에 기록 |
| `/write-rules` | 룰북 작성·수정 시 문장 규칙과 구조 |
| `/playtest-report` | 플레이테스트(실제 또는 가상) 결과를 `playtests/`에 기록 |
| `/commit-push` | 한국어 메시지로 커밋하고 `dev`에 푸시 |
