# LIGHTCONE (라이트콘)

2인 성간 대결 보드게임. 핵심 메커니즘은 **빛의 속도 지연**이다. 상대는 언제나 내 **과거**를 보고 판단하며, 나는 그 점을 역이용한다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 디지털 프로토타입(예: 웹 시뮬레이터)은 필요할 때 `prototype/`에 따로 만든다. 룰의 기준은 항상 `rules/rulebook.md`다.

## 핵심 디자인 기둥 (변경 시 사용자 확인 필수)

1. **지연은 눈에 보여야 한다.** 기록지 계산이 아니라 보드 위 부품의 움직임(잔상, 파문)으로 지연을 표현한다.
2. **예측형 심리전이 중심, 추리형이 보조다.** "상대가 내 과거를 보고 움직인다"는 사실을 이용해 함정을 파는 재미가 핵심이다.
3. **2인 전용, 45~60분.** 관찰자 문제(플레이어마다 다른 지연)를 피하기 위해 2인으로 고정한다.
4. **"빛이 도착했을 때 이미 끝나 있는" 승리.** 승리 조건은 지연을 이용한 기습과 선점을 보상해야 한다.

## 폴더 구조

```
Lightcone/
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
├── print/               # scripts/pnp/build_pnp.py 가 만드는 출력용 PDF 위치(저장소에는 없음)
├── prototype/           # 웹 시뮬레이터(봇 대전): src/(규칙 엔진·봇·지도), web/(화면), test/
├── package.json         # npm test(node --test) · npm run build(→ dist/, 의존성 없음)
├── scripts/
│   ├── build.mjs        # prototype → dist 복사
│   ├── pnp/             # 출력용 PDF 생성기(reportlab)
│   ├── deploy-aws.ps1   # 수동 배포
│   └── aws/             # EC2 준비·재시작 스크립트, 정적 서버(serve.mjs)
└── .github/workflows/   # ci.yml(검사), deploy-aws.yml(main 병합 시 배포)
```

- 웹 시뮬레이터 규칙은 룰북을 따라야 한다. 룰북을 바꾸면 `prototype/src/engine.js`·`map.js`와 테스트도 함께 고친다. 화면 흐름 점검은 `?selftest` 쿼리로 한다.

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
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-lightcone.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- **2026-11-24부터 운영은 GameHub 허브 안에서 실행된다**(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs`). 접속은 `http://54.116.67.196/lightcone/`. 배포하면 `deploy-remote.sh`가 예전 systemd `lightcone` 서비스를 끄고 허브(`gamehub`)를 재시작한다 — 허브 안 다른 게임의 진행 중인 방도 함께 사라진다. `serve.mjs`는 로컬 단독 실행용으로 남는다. 아래의 포트·systemd 설명은 예전 단독 운영 기준이다.
- 다른 게임(Eleven·MagicAcademy·SmilePark·DoubleAgent·Tesseract·Neoterra·Election 등)과 같은 EC2(t4g.nano, 서울) 1대를 공유한다. Lightcone의 포트는 **8099**, systemd 서비스 이름은 `lightcone`이다. 접속은 `http://54.116.67.196:8099` (HTTP만).
- 배포 대상은 디지털 프로토타입(정적 웹앱)이다. **`package.json`이 없는 동안에는 CI 검사와 배포를 모두 건너뛴다.** 프로토타입을 만들 때는 `package.json`을 저장소 루트에 두고 `npm test`·`npm run build`(산출물 `dist/`)를 제공한다.
- `main`에 병합되면 `.github/workflows/deploy-aws.yml`이 `npm test` → `npm run build`를 통과했을 때만 `dist`와 `scripts/aws/`(의존성 없는 정적 서버 `serve.mjs`, `deploy-remote.sh`)를 `~/lightcone`에 올리고, `deploy-remote.sh`가 systemd `lightcone`을 재시작·헬스체크한다.
- **수동 배포**(push 없이): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1`. SSH 키·IP는 `.dev/`(git 제외), 없으면 `../Rootbound/.dev/`의 것을 쓴다.
- SSH(22)는 관리자 IP만 열려 있어 워크플로가 러너 IP를 임시로 열었다 닫는다. 저장소 시크릿: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_SECURITY_GROUP_ID / EC2_HOST / EC2_HOST_KEY / EC2_SSH_PRIVATE_KEY (다른 게임 저장소와 같은 값, 정본은 저장소 밖 `personal/aws_config.md`).
- 서버 준비(완료, 2026-11-23): 보안 그룹 TCP 8099 인바운드 추가, 저장소 시크릿 7개 등록.

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
