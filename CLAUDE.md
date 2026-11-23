# PROXYMIND (프록시마인드)

3~5인 로봇 아레나 대결 보드게임. 핵심 메커니즘은 **남이 짠 두뇌로 움직이기**다. 내 로봇은 **왼쪽 플레이어가 꽂아 준 행동 규칙**대로만 움직이고, 나는 오른쪽 플레이어의 로봇에 규칙을 꽂아 준다. 프로그래밍 게임을 뒤집어, "적을 위한 AI를 설계하는" 심리전을 만든다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 디지털 프로토타입(예: 웹 시뮬레이터)은 필요할 때 `prototype/`에 따로 만든다. 룰의 기준은 항상 `rules/rulebook.md`다.

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
├── scripts/
│   ├── deploy-aws.ps1   # 수동 배포
│   └── aws/             # EC2 준비·재시작 스크립트, 정적 서버(serve.mjs)
└── .github/workflows/   # ci.yml(검사), deploy-aws.yml(main 병합 시 배포)
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

- **저장소:** https://github.com/gillettef/Proxymind.git (기본 브랜치: `dev`)
- **작은 작업 단위가 끝날 때마다 반드시 commit하고 push한다.** 여러 작업을 모아서 한 번에 올리지 않는다. `/commit-push` 스킬을 쓴다. (이 규칙은 커밋·푸시에 대한 사전 승인이다. 단, force push·히스토리 변경은 사용자에게 먼저 확인한다.)
- **commit 메시지는 한국어로 쓴다.** 형식은 `/commit-push` 스킬을 따른다. (예: `규칙: 규칙 타일 발동 순서 문장 정리`)
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(`.github/workflows/ci.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- 다른 게임(Eleven·MagicAcademy·SmilePark·DoubleAgent·Tesseract·Neoterra·Election·Lightcone 등)과 같은 EC2(t4g.nano, 서울) 1대를 공유한다. Proxymind의 포트는 **8105**, systemd 서비스 이름은 `proxymind`이다. 접속은 `http://54.116.67.196:8105` (HTTP만).
- 배포 대상은 웹 시뮬레이터(`prototype/`)다. 정적 프론트(`dist/`)와 온라인 대전 WebSocket(`/ws`)을 한 포트에서 서빙하는 Node 서버(`server-dist/server.cjs`, 의존성 없이 실행)로 구성된다. `npm test`·`npm run build`가 통과해야 배포된다.
  - `prototype/src/core/`: 룰북을 구현한 규칙 엔진·봇 AI·자동 시뮬레이션(브라우저와 서버가 같이 쓴다). **룰북을 바꾸면 엔진(`data.ts`·`engine.ts`)과 테스트도 같이 고친다.**
  - `prototype/server/`: 온라인 방 관리(`hub.ts`). 방 상태는 서버 메모리에만 있다.
  - 개발: `npm run server`(8105) + `npm run dev`(5195, `/ws`를 8105로 프록시).
- `main`에 병합되면 `.github/workflows/deploy-aws.yml`이 `npm test` → `npm run build`를 통과했을 때만 `dist`·`server-dist`·`scripts/aws/`(진입점 `serve.mjs`, `deploy-remote.sh`)를 `~/proxymind`에 올리고, `deploy-remote.sh`가 systemd `proxymind`를 재시작·헬스체크한다.
- **수동 배포**(push 없이): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1`. SSH 키·IP는 `.dev/`(git 제외), 없으면 `../Rootbound/.dev/`의 것을 쓴다.
- SSH(22)는 관리자 IP만 열려 있어 워크플로가 러너 IP를 임시로 열었다 닫는다. 저장소 시크릿: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_SECURITY_GROUP_ID / EC2_HOST / EC2_HOST_KEY / EC2_SSH_PRIVATE_KEY (다른 게임 저장소와 같은 값, 정본은 저장소 밖 `personal/aws_config.md`).
- 서버 준비(완료, 2026-11-23): `scripts/aws/provision.sh` → `scripts/aws/units.sh`(systemd `proxymind` 등록·enable), 보안 그룹 TCP 8105 인바운드 추가, 저장소 시크릿 7개 등록.

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
