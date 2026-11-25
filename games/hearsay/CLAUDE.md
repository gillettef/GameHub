# HEARSAY (히어세이)

4~6인 기억·정치·블러핑 보드게임. 핵심 메커니즘은 **집단 기억으로 역사 정하기**다. 보드에 놓인 기록은 시간이 지나면 뒤집혀 **망각 더미**에 섞여 **물리적으로 사라진다**. 나중에 "3계절에 강가 땅은 누구 것이었나?"가 점수를 가를 때 확인할 방법은 없다. 플레이어는 각자 기억을 **증언**하고, 다수의 증언이 **공식 역사**가 된다. 거짓 증언으로 역사를 조작할 수도 있다.

## 프로젝트 성격

- 코드가 아니라 **보드게임 디자인 문서** 프로젝트다. 산출물은 룰북, 구성물 목록, 플레이테스트 기록, 디자인 결정 로그다.
- 모든 문서는 한국어로 쓴다. 게임 용어는 `docs/glossary.md`의 표기를 따른다(한국어 용어 + 영문 병기).
- 디지털 프로토타입은 웹 시뮬레이터(`src/`)다. 봇 대전과 온라인 대전을 제공한다. 룰의 기준은 항상 `rules/rulebook.md`이며, 룰을 바꾸면 `src/engine/rules.js`·`game.js`와 테스트도 함께 고친다.
- 시뮬레이터는 서버 권위형이다. 망각된 칸의 진실은 엔진에서도 지우고 클라이언트에 보내지 않는다(기둥 1). 지난 기록·채팅 로그를 화면에 남기지 않는다.
- 로컬 실행: `npm start` → http://localhost:8103

## 핵심 디자인 기둥 (변경 시 사용자 확인 필수)

> 2026-11-23 사용자가 4개 기둥을 모두 확정했다(D-005). 기둥을 바꾸려면 사용자 확인을 받는다.

1. **지워진 기록은 정말로 지워진다.** 망각된 정보는 어떤 수단으로도 다시 확인할 수 없다. 메모, 사진, 되짚어 보기를 금지하고, 구성물도 진실을 복원할 단서를 남기지 않게 만든다.
2. **진실이 아니라 합의가 점수가 된다.** 득점은 실제로 일어난 일이 아니라 공식 역사를 기준으로 한다. 한번 공식 역사가 된 내용은 게임 끝까지 바뀌지 않는다.
3. **기억은 자유, 절차는 기계적.** 무엇을 증언할지는 각자의 기억과 속셈에 맡기지만, 증언 공개·집계·동점 처리는 토론 없이 결론이 나는 절차로 정한다.
4. **4~6인, 45~60분.** 다수결이 정치가 되려면 연합과 배신이 가능한 4인 이상이 필요하다.

## 폴더 구조

```
Hearsay/
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
├── contest/             # 2027 코리아보드게임즈 공모전 제출 준비 (체크리스트, 기획안 초안)
├── src/               # 웹 시뮬레이터: engine/(룰 엔진·봇), server/(방·SSE API), web/(화면)
├── test/              # npm test (node --test)
├── scripts/
│   ├── build.mjs        # npm run build → dist/
│   ├── deploy-aws.ps1   # 수동 배포
│   └── aws/             # EC2 준비·재시작 스크립트, 정적 서버(serve.mjs)
└── .github/workflows/   # ci.yml(검사), deploy-aws.yml(main 병합 시 배포)
```

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
- **일상 작업은 `dev`에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-hearsay.yml`)만 돌고, `main` 병합이 곧 운영 배포다.

## 배포 (AWS)

- **2026-11-24부터 운영은 GameHub 허브 안에서 실행된다**(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs` → `dist/server/rooms.mjs`의 `handleApi`·`shutdown`). 접속은 `http://54.116.67.196/hearsay/`. 배포하면 `deploy-remote.sh`가 예전 systemd `hearsay` 서비스를 끄고 허브(`gamehub`)를 재시작한다 — 허브 안 다른 게임의 진행 중인 방도 함께 사라진다. `serve.mjs`는 로컬 단독 실행용으로 남는다. 아래의 포트·systemd 설명은 예전 단독 운영 기준이다.

- 다른 게임(Eleven·MagicAcademy·SmilePark·DoubleAgent·Tesseract·Neoterra·Election·Lightcone·Retrocause 등)과 같은 EC2(t4g.nano, 서울) 1대를 공유한다. Hearsay의 포트는 **8103**, systemd 서비스 이름은 `hearsay`이다. 접속은 `http://54.116.67.196:8103` (HTTP만).
- 배포 대상은 디지털 프로토타입(정적 웹앱)이다. **`package.json`이 없는 동안에는 CI 검사와 배포를 모두 건너뛴다.** 프로토타입을 만들 때는 `package.json`을 저장소 루트에 두고 `npm test`·`npm run build`(산출물 `dist/`)를 제공한다.
- `main`에 병합되면 `.github/workflows/deploy-aws.yml`이 `npm test` → `npm run build`를 통과했을 때만 `dist`와 `scripts/aws/`(의존성 없는 정적 서버 `serve.mjs`, `deploy-remote.sh`)를 `~/hearsay`에 올리고, `deploy-remote.sh`가 systemd `hearsay`를 재시작·헬스체크한다.
- **수동 배포**(push 없이): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1`. SSH 키·IP는 `.dev/`(git 제외), 없으면 `../Rootbound/.dev/`의 것을 쓴다.
- SSH(22)는 관리자 IP만 열려 있어 워크플로가 러너 IP를 임시로 열었다 닫는다. 저장소 시크릿: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_SECURITY_GROUP_ID / EC2_HOST / EC2_HOST_KEY / EC2_SSH_PRIVATE_KEY (다른 게임 저장소와 같은 값, 정본은 저장소 밖 `personal/aws_config.md`).
- 서버 준비(완료, 2026-11-23): `scripts/aws/provision.sh` → `scripts/aws/units.sh`(systemd `hearsay` 등록·enable), 보안 그룹 TCP 8103 인바운드 추가, 저장소 시크릿 7개 등록.

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
