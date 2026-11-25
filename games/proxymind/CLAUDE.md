# PROXYMIND (프록시마인드)

3~5인 로봇 아레나 대결 보드게임. 핵심 메커니즘은 **남이 짠 두뇌로 움직이기**다. 내 로봇은 **왼쪽 플레이어가 꽂아 준 행동 규칙**대로만 움직이고, 나는 오른쪽 플레이어의 로봇에 규칙을 꽂아 준다. 프로그래밍 게임을 뒤집어, "적을 위한 AI를 설계하는" 심리전을 만든다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 디지털 버전(웹 게임)은 GameHub 공통 구조(`src/engine`·`src/def.ts`·`src/client`·`server`)에 있다. 룰의 기준은 항상 `rules/rulebook.md`다.

## 핵심 디자인 기둥 (변경 시 사용자 확인 필수)

1. **내 로봇의 두뇌는 남이 짠다.** 로봇의 이동과 행동은 설계자가 꽂은 규칙 타일이 정한다. 조종사는 규칙을 고칠 수 없고, 규칙이 발동하는 **상황**을 바꿔서 대응한다.
2. **양쪽 모두 재미있어야 한다.** "남의 규칙의 빈틈을 찾는 퍼즐"(조종사)과 "남을 망칠 함정을 설계하는 심리전"(설계자)이 같은 무게를 가진다. 한쪽만 재미있으면 실패다.
3. **실행은 결정적이고 공개된다.** 규칙 타일은 앞면으로 공개되고, 발동 판정은 누가 해도 같은 결과가 나와야 한다. 판정 분쟁이 생기는 조건 문구는 쓰지 않는다.
4. **3~5인, 45분 안팎.** 왼쪽·오른쪽 관계가 원형으로 이어지는 인원을 기본으로 한다. 2인 규칙은 별도 변형으로 다룬다.

## 폴더 구조

```
Proxymind/
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
├── src/
│   ├── engine/          # 룰북을 구현한 규칙 엔진·봇 AI·자동 시뮬레이션(순수 TS, 브라우저·서버 공용)
│   ├── def.ts           # 공통 방·진행 코드(@gamehub/net)에 엔진을 연결하는 GameDef(좌석별로 가린 view, 행동 검사, 봇)
│   ├── text.ts          # 사건·개입 문장(기록), 좌석 색
│   └── client/          # React 화면(처음·대기실은 @gamehub/ui, 대국은 GameShell, 자동 시뮬레이션)
├── server/app.ts        # createRoomApp(def) — 온라인 방(/ws, /health)
├── test/                # 엔진 테스트(engine.test.ts), GameDef·방 흐름(def.test.ts)
├── e2e/mobile.mjs       # iPhone 17 Pro 화면 확인(모든 모드)
└── scripts/aws/hub-entry.mjs  # 허브 inproc 진입점
```

## 작업 규칙

- **결정은 기록한다.** 규칙을 정하거나 바꾸면 `/design-log` 스킬로 `docs/decisions.md`에 남긴다. 되돌린 결정도 지우지 말고 "폐기" 상태로 둔다.
- **룰 문장은 `/write-rules` 스킬의 규칙을 따른다.** 하나의 문장에는 하나의 규칙만 쓰고, 용어는 용어집과 정확히 일치시킨다.
- **규칙 타일 문구는 `/write-rules`의 "타일 문구 규칙"을 따른다.** 조건과 행동은 보드에서 바로 판정할 수 있는 말로만 쓴다.
- **새 용어는 용어집에 먼저 추가한다.** 같은 개념에 두 개의 이름을 쓰지 않는다.
- **룰을 크게 바꾼 뒤에는 검증한다.** `rules-reviewer` 에이전트로 모순과 빈틈을 찾고, `playtest-simulator` 에이전트로 가상 플레이를 돌려본다.
- **수치는 근거와 함께 쓴다.** 밸런스 수치를 바꿀 때는 `balance-analyst` 에이전트의 분석이나 플레이테스트 결과를 근거로 남긴다.
- 기존 게임의 이름, 캐릭터, 아트, 고유 규칙 문구를 베끼지 않는다. 장르적 메커니즘 참고(프로그래밍 이동 등)는 괜찮다.

## Git 규칙

- **저장소:** https://github.com/gillettef/GameHub.git 의 `games/proxymind/` (모노레포, 옛 개별 저장소 `gillettef/Proxymind` 는 2026-11-25 삭제) (기본 브랜치: `dev`)
- **작은 작업 단위가 끝날 때마다 반드시 commit하고 push한다.** 여러 작업을 모아서 한 번에 올리지 않는다. `/commit-push` 스킬을 쓴다. (이 규칙은 커밋·푸시에 대한 사전 승인이다. 단, force push·히스토리 변경은 사용자에게 먼저 확인한다.)
- **commit 메시지는 한국어로 쓴다.** 형식은 `/commit-push` 스킬을 따른다. (예: `규칙: 규칙 타일 발동 순서 문장 정리`)
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- 운영은 GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs` → `server-dist/app.cjs`(`server/app.ts`)). 접속은 `http://54.116.67.196/proxymind/`.
- 개발·검사는 GameHub 루트 npm workspaces 로 한다(`npm install` 은 루트에서). 이 폴더에서 `npm run dev`(화면과 온라인 서버가 vite 하나로 뜬다), `npm test`, `npm run build`, `npm run e2e`. 루트에서 `npm run check` / `npm run e2e`.
- **룰북을 바꾸면 엔진(`src/engine/data.ts`·`engine.ts`)과 테스트도 같이 고친다.** 엔진은 React·DOM·시간·난수(Math.random)를 직접 쓰지 않는다(시드 RNG).
- 클라이언트는 상대경로만 쓴다(허브 `/proxymind/` 아래). localStorage 키는 `proxymind:` 접두어.
- `main` 병합 때 GameHub `deploy.yml` → `deploy-proxymind.yml` → 공통 `deploy-workspace-game.yml` 이 검사·빌드를 통과한 산출물(`dist`, `server-dist`, `scripts/aws`)만 `~/proxymind` 에 올리고 허브(`gamehub`)를 재시작한다. 재시작하면 모든 게임의 진행 중인 방이 사라진다. 수동 재배포는 Actions → Deploy proxymind.
- 방 상태는 서버 메모리에만 있다. 온라인은 대기실 → 방장 시작(빈자리는 봇), 끊긴 사람의 차례는 45초 뒤 봇이 대신 둔다(공통 진행 방식, `docs/refactor-plan.md` 9절).
- 예전 단독 운영(포트 8105, systemd `proxymind`, `prototype/` 웹 시뮬레이터, 수동 배포 스크립트)은 2026-11-25 새 구조로 옮기며 없앴다.

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `rules-reviewer` | 룰북과 규칙 타일 문구의 모순, 모호함, 미정의 상황, 용어 불일치 검수 |
| `playtest-simulator` | 현재 룰로 3~5인 가상 플레이를 진행하고 막히는 지점과 재미 요소 보고 |
| `balance-analyst` | 지배 규칙 조합, 무력화 불가능한 함정, 자리 위치 유불리, 수치 밸런스 분석 |

## 스킬

| 스킬 | 용도 |
|---|---|
| `/design-log` | 디자인 결정을 `docs/decisions.md`에 기록 |
| `/write-rules` | 룰북·규칙 타일 문구 작성·수정 시 문장 규칙과 구조 |
| `/playtest-report` | 플레이테스트(실제 또는 가상) 결과를 `playtests/`에 기록 |
| `/commit-push` | 한국어 메시지로 커밋하고 `dev`에 푸시 |
