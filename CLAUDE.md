# LASTGRAIN (라스트그레인)

2~4인 실시간·턴제 혼합 전술 보드게임. 핵심 메커니즘은 **수명이 붙은 말**이다. 모든 **모래병**에는 작은 실물 **모래시계**가 꽂혀 있고, 마지막 모래알이 떨어지면 그 모래병은 **소멸**한다. 게임은 차례제로 진행하지만 모래는 실시간으로 흐르므로, 오래 고민할수록 내 군대가 줄어든다. 모래시계를 **뒤집기**하면 수명을 되살릴 수 있지만, 남은 시간과 지난 시간이 **역전**된다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 디지털 프로토타입(예: 웹 시뮬레이터)은 필요할 때 `prototype/`에 따로 만든다. 룰의 기준은 항상 `rules/rulebook.md`다.

## 핵심 디자인 기둥 (변경 시 사용자 확인 필수)

> 초기 제안이다. 사용자 확인 전까지 관련 결정은 `가안`으로 둔다.

1. **남은 모래가 곧 생명이다.** 모래병의 체력과 수명은 모래시계 잔량 하나로만 표현한다. 체력 토큰이나 기록지 같은 보조 표시를 따로 두지 않는다.
2. **고민은 공짜가 아니다.** 차례제 게임이지만 시간은 실시간으로 흐른다. 생각하는 시간 자체가 내 군대를 깎는 비용이 되게 하여 장고를 막고 긴장감을 만든다.
3. **뒤집기는 양날의 검이다.** 뒤집기는 남은 시간을 지난 시간으로 바꾼다. 거의 빈 모래시계에는 회복이 되고, 거의 찬 모래시계에는 치명상이 된다. "언제 뒤집느냐"가 게임의 핵심 판단이다.
4. **2~4인, 20~30분.** 실시간 압박이 지치지 않고 유지되는 짧은 길이를 목표로 한다. 2인 결투가 기본이고 4인은 2:2 팀전으로 한다.

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
├── scripts/
│   ├── deploy-aws.ps1   # 수동 배포
│   └── aws/             # EC2 준비·재시작 스크립트, 정적 서버(serve.mjs)
└── .github/workflows/   # ci.yml(검사), deploy-aws.yml(main 병합 시 배포)
```

## 작업 규칙

- **결정은 기록한다.** 규칙을 정하거나 바꾸면 `/design-log` 스킬로 `docs/decisions.md`에 남긴다. 되돌린 결정도 지우지 말고 "폐기" 상태로 둔다.
- **룰 문장은 `/write-rules` 스킬의 규칙을 따른다.** 하나의 문장에는 하나의 규칙만 쓰고, 용어는 용어집과 정확히 일치시킨다.
- **새 용어는 용어집에 먼저 추가한다.** 같은 개념에 두 개의 이름을 쓰지 않는다.
- **룰을 크게 바꾼 뒤에는 검증한다.** `rules-reviewer` 에이전트로 모순과 빈틈을 찾고, `playtest-simulator` 에이전트로 가상 플레이를 돌려본다.
- **수치는 근거와 함께 쓴다.** 밸런스 수치(모래시계 길이, 뒤집기 횟수, 대모래시계 길이 등)를 바꿀 때는 `balance-analyst` 에이전트의 분석이나 플레이테스트 결과를 근거로 남긴다.
- 기존 게임의 이름, 캐릭터, 아트, 고유 규칙 문구를 베끼지 않는다. 장르적 메커니즘 참고는 괜찮다.

## Git 규칙

- **저장소:** https://github.com/gillettef/Lastgrain.git (기본 브랜치: `dev`)
- **작은 작업 단위가 끝날 때마다 반드시 commit하고 push한다.** 여러 작업을 모아서 한 번에 올리지 않는다. `/commit-push` 스킬을 쓴다. (이 규칙은 커밋·푸시에 대한 사전 승인이다. 단, force push·히스토리 변경은 사용자에게 먼저 확인한다.)
- **commit 메시지는 한국어로 쓴다.** 형식은 `/commit-push` 스킬을 따른다. (예: `규칙: 뒤집기 단계 문장 정리`)
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(`.github/workflows/ci.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- 다른 게임(Eleven·MagicAcademy·SmilePark·DoubleAgent·Tesseract·Neoterra·Election·Lightcone·Retrocause 등)과 같은 EC2(t4g.nano, 서울) 1대를 공유한다. Lastgrain의 포트는 **8104**, systemd 서비스 이름은 `lastgrain`이다. 접속은 `http://54.116.67.196:8104` (HTTP만).
- 배포 대상은 디지털 프로토타입(정적 웹앱)이다. **`package.json`이 없는 동안에는 CI 검사와 배포를 모두 건너뛴다.** 프로토타입을 만들 때는 `package.json`을 저장소 루트에 두고 `npm test`·`npm run build`(산출물 `dist/`)를 제공한다.
- `main`에 병합되면 `.github/workflows/deploy-aws.yml`이 `npm test` → `npm run build`를 통과했을 때만 `dist`와 `scripts/aws/`(의존성 없는 정적 서버 `serve.mjs`, `deploy-remote.sh`)를 `~/lastgrain`에 올리고, `deploy-remote.sh`가 systemd `lastgrain`을 재시작·헬스체크한다.
- **수동 배포**(push 없이): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1`. SSH 키·IP는 `.dev/`(git 제외), 없으면 `../Rootbound/.dev/`의 것을 쓴다.
- SSH(22)는 관리자 IP만 열려 있어 워크플로가 러너 IP를 임시로 열었다 닫는다. 저장소 시크릿: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_SECURITY_GROUP_ID / EC2_HOST / EC2_HOST_KEY / EC2_SSH_PRIVATE_KEY (다른 게임 저장소와 같은 값, 정본은 저장소 밖 `personal/aws_config.md`).
- 서버 준비(완료, 2026-11-23): `scripts/aws/provision.sh` → `scripts/aws/units.sh`(systemd `lastgrain` 등록·enable), 보안 그룹 TCP 8104 인바운드 추가, 저장소 시크릿 7개 등록.

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `rules-reviewer` | 룰북의 모순, 모호함, 미정의 상황(특히 실시간 판정 시점), 용어 불일치 검수 |
| `playtest-simulator` | 현재 룰로 2~4인 가상 플레이를 진행하며 차례별 고민 시간과 모래시계 잔량을 추적하고, 막히는 지점과 재미 요소 보고 |
| `balance-analyst` | 모래시계 길이별 모래병 가치, 뒤집기 기대값, 고민 시간의 비용, 차례 순서 유불리, 지배 전략 분석 |

## 스킬

| 스킬 | 용도 |
|---|---|
| `/design-log` | 디자인 결정을 `docs/decisions.md`에 기록 |
| `/write-rules` | 룰북 작성·수정 시 문장 규칙과 구조 |
| `/playtest-report` | 플레이테스트(실제 또는 가상) 결과를 `playtests/`에 기록 |
| `/commit-push` | 한국어 메시지로 커밋하고 `dev`에 푸시 |
