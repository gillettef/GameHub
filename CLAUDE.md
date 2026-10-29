# Rootbound

웹 브라우저(와 실물 보드게임)로 즐기는 **정원 땅따먹기 보드게임**. 2026-10-16 **오프라인판(v3)** 으로 바꿨다: 차례마다 마켓 2장 중 1장이나 카드 더미 맨 위 1장(뒷면)을 가져와 손 2장 중 1장을 심고, 카드의 **뿌리 모양**을 원하는 방향으로 돌려 내 색 **뿌리 큐브**를 놓는다. 한 칸에는 한 색만 있고 남의 큐브는 1:1로 밀어낸다(줄다리기). 식물은 주인이 없고 그 칸 큐브 주인의 것이다. 1인 큐브 수가 정해져 있어 모자라면 가장 높이 쌓인 내 칸에서 옮겨 온다. 라운드가 끝나면 공급처에 큐브가 가장 많이 남은 사람이 다음 선. 끝나면 내 큐브가 있는 칸 + 목표 카드 3장. 식물 9종(판마다 2·3인 6종 / 4인 8종), 목표 16장. **공모전 응모 범위는 2~3인**(4인은 온라인만).
정원 / 점수 / 진행 / 카드 / 설명 다섯 탭으로 화면을 나누고, 스크롤 없이 한 화면에서 대국을 진행한다.

> 2026-10-07 사용자 지시로 이전 게임(AstralTab, 카드 기반 우주 전투 보드게임)을 전부 걷어내고 Rootbound 로 교체했다. 예전 규칙·코드는 git 기록에만 있다. 저장소·EC2 경로·systemd 서비스 이름에는 옛 이름(AstralTab, astraltab-*)이 남아 있다(아래 "실행 환경").

**게임 규칙의 정본은 `notes/Rules.md` 다.** 룰 엔진·AI·UI 어디든 규칙이 어긋나면 Rules.md가 맞다. 규칙을 바꿀 때는 Rules.md를 먼저 고친다.

| 문서 | 내용 |
|---|---|
| `notes/Rules.md` | **규칙 정본**. 보드 조립(대칭 조각 배치), 이번 판 식물·공개 단계·라운드(차례 = 가져오기 → 심기, 공급처 큐브 최다 선), 뿌리 큐브 줄다리기·공급처, 식물 9종, 목표 16장, 점수·순위, 온라인 제한 시간(6.3), 상수, 결정성, 밸런스 근거 |
| `notes/Rulebook.md` | **플레이어용 규칙서**(2~3인 실물판, 공모전 제출 초안). 정본은 Rules.md |
| `notes/Cards.md` | 식물 카드 9종·목표 카드 16장·카드 구성 정리(정본 아님, 수치 바꾸면 함께 고침) |
| `notes/Story.md` | 배경 이야기(달빛 정원 박람회). **규칙 아님**. 설명 탭 "이야기" 문단의 원문 |
| `notes/Expansions.md` | 확장판 아이디어 메모(지역별 식물·지형, 구조 준비 사항). **규칙 아님, 구현하지 않음** |
| `notes/Contest.md` | 2027 코리아보드게임즈 공모전 검토(마감 2026-12-31). 2025·2026 당선작 심사평, 5개 지표 점수표·결과, **다음에 이어서 할 일(4절)**. **규칙 아님** |
| `notes/Board.md` | 보드 디자인 참고(시안 `notes/design/board-2p.svg`, 육각 좌표, 지형 4종·현재 색/무늬, 정원 조각 12+입구, 인원별 윤곽·입구 위치·ASCII 그림, 보드 위 요소 표시 방식, 디자인 제약). **규칙 아님**, Rules.md 2·3절 요약 |

---

## 필수 작업 규칙

1. **작업이 완료되면 반드시 `git commit` & `git push`를 진행한다.** 기능 하나, 버그 수정 하나 등 의미 있는 단위가 끝날 때마다 커밋하고 푸시한다. `/commit-push` 스킬을 사용한다.
2. **commit 메시지는 가급적 한국어로 작성한다.** 제목은 `<타입>: <요약>` 형식 (예: `기능: 마켓 화면 (F008)`, `수정: 칡 거리 계산`). 관련 F-ID가 있으면 괄호로 덧붙인다.
3. **push 대상 repo는 `https://github.com/gillettef/Rootbound.git` 이다**(2026-10-07 AstralTab 에서 이름 변경). 브랜치는 `main`을 기본으로 사용한다.
4. **이 서비스는 DB를 사용하지 않는다.** DB·Redis·ORM을 도입하지 않는다. 아래 "DB 없는 상태 관리" 참고.
5. 로컬 테스트 시 서버를 포그라운드로 직접 띄우지 않는다(터미널이 블로킹됨). 반드시 `/dev`로 시작하고 `/dev-stop`으로 종료한다. `scripts/dev.ps1` 출력을 `| grep` 등 다른 프로세스로 파이프하지 않는다.
6. 포트 3001은 이 PC에서 사용자의 다른 프로젝트(Eleven)가 쓴다. Rootbound 서버는 3101을 쓰며, 3001을 점유한 프로세스는 절대 종료하지 않는다.
7. **규칙 변경은 세 곳을 함께 고친다**: `notes/Rules.md` → `shared/src/engine` + `shared/src/data` (Vitest, `data.test.ts` 가 Rules.md 표와 데이터를 대조한다) → `npm run fixtures` → `ai/astral_ai/rules.py` (pytest, 픽스처 재생으로 TS·Python 일치 검증).
8. **Claude Code는 사용자에게 보이는 답변(채팅 응답)을 한국어로 작성한다.** 코드 식별자는 영어로 쓰되(코딩 규칙 참고), 설명·요약·질문 등 대화 텍스트는 한국어를 쓴다.
9. **수치를 바꿀 때는 먼저 시뮬레이터로 잰다**: `npx tsx shared/scripts/lab/run.ts <변형> [인원=2,3,4] [배율]` (변형은 `lab/registry.ts` 에 추가, `LAB_PATCH=<json>` 으로 파일 수정 없이 시험, 여러 변형 비교는 `lab/sweep.ts`). 자리·식물 승률, 재미·결정 지표, 5개 지표 점수표를 출력한다. 결과와 결정 이유는 Rules.md 12절에 남긴다.

---

## 코드 현황 (2026-10-29, 오프라인판 v3, 전체 리팩토링 후)

- **shared** (`shared/src`): 타입(`types/index.ts`, 이벤트 `types/events.ts`), 데이터(`data/constants.ts` 인원별 규칙 `PLAYER_COUNT_RULES`(이번 판 식물 수·장수·마켓 2장·1인 큐브·덤)·입구 큐브·목표 점수(`RANK_FIRST_BONUS` 등)·제한 시간·닉네임/방 비밀번호 규칙(`isValidNickname`·`isValidRoomPassword`)·시간 초과 로그 표지(`TIMEOUT_LOG_MARK`), `data/species.ts` 식물 9종 `SPECIES`·목표 16장 `GOALS`, `data/tiles.ts` 정원 조각), 엔진(`engine/board.ts` 대칭 보드 조립·축 좌표·보드 색인·칸 이름 `cellLabels`/`cellLabel`(기록용 `C4`), `influence.ts` 뿌리 큐브(칸 주인 `computeOwners`·공급처 `supplyLeft`·회전 `rotateSpot`·뿌리 놓을 칸 `rootTargets`·줄다리기 `plantRoots`·입구 큐브)·심을 칸 `legalPlantCells`·민들레 씨앗 `legalSeedCells`, `scoring.ts` 땅·목표·점수·순위, `turn.ts` 로비→공개 단계(`reveal`, `CONFIRM`)→라운드(이번 판 식물 `pickGarden`, `stage` 가져오기 `TAKE`(마켓 번호 또는 `'pile'` 더미 뒷면, `applyTake`)·`validateTake` → 심기 `PLANT`(회전·씨앗, `applyPlant`·기록 `logPlant`)/`DISCARD`, 공급처 큐브 최다 선 `nextRoundStart`)→종료 `applyAction`, 시간 초과 자동 수 `autoAction`, 난수 `rng.ts`), 가림 `mask.ts`. Vitest 67개. 실험실·픽스처 스크립트(`shared/scripts`)도 `tsconfig.scripts.json` 으로 타입 검사한다.
- **server**: `rooms/manager.ts`(방·초대 id·비밀번호·자리·AI 추가, 차례 제한 시간·자동 수·AI 대리, 판 요약 기록 표시 `takeRecord`), `rooms/validate.ts`(요청 모양 검사 `actionShapeError`, 옛 형식 스냅샷 판별 `isCurrentFormat`, 재접속 토큰 검사), `rooms/record.ts`(판 요약 `GameRecord`·`buildRecord`), `game/aiTurn.ts`(AI·대리 자리 차례마다 Python `/decide` → 엔진 검증 → 실패 시 `autoAction` 폴백, 폴백은 여기 한 곳), `ai/client.ts`(AI 서비스 HTTP 호출·타임아웃, 실패면 null), `persistence/snapshots.ts`(JSON 스냅샷), `persistence/stats.ts`(판 요약·웹 성능 JSONL), `index.ts`(Socket.io, `socket.use` 로 요청 모양 검사, 입장한 사람 요청 공통 처리 `handlePlayer`, 남용 방지(방 만들기·비밀번호 대입·웹 성능 빈도), 방별 타이머, `POST /api/vitals`). 서버 시작 시 옛 형식 스냅샷은 `rooms-legacy/` 로 옮긴다. Vitest 28개.
- **AI** (`ai/astral_ai`, 패키지 이름은 옛 이름 그대로): `models.py`(Pydantic, TS 타입 1:1), `rules.py`(TS 엔진 시뮬레이션 사본, 수치는 `shared/fixtures/specs.json`), `search.py`(1수 탐욕: 심기 = 손 카드 × 칸 × 회전(× 민들레 씨앗 상위 칸)에서 내 총점 − 최고 상대 총점, 가져오기 = 그 카드로 둘 최선 1수 가치 + 공개 목표 연계 가산, 더미 뒷면은 못 본 카드 분포의 기댓값 `unseen_cards`, 시간 제한 안에 최선 수), `main.py`(`GET /health` → `rootbound-ai`, `POST /decide`, None 필드 제외). 목표 점수·꽃/나무 종도 `specs.json` 에서 읽는다. pytest 25개.
- **client**: 경로 `/` 랜딩(AI와 바로 시작 `lib/quickStart.ts`·방 만들기·초대 참여·핫시트·튜토리얼), `/hotseat` 같은 기기(인원·닉네임 → 바로 시작, 차례마다 기기 넘김 `HandoffOverlay`), `/tutorial` 연습 봇(`game/tutorialBot.ts`)과 단계 안내(`TutorialCoach`), `/room/:id` 온라인 로비(방 → 자리 → 준비·제한 시간) → 게임. 게임 화면: `PlayerStrip`(단계·차례·남은 시간·자리별 땅/점수/공급처 뿌리) → 탭(정원 `BoardTab`: 공개 단계면 `RevealPanel`, 아니면 목표 칩 + `HexBoard`(SVG 육각 보드, 칸별 뿌리 수 배지는 칸 위 별도 층) + `Market`(마켓·더미 장수, 심을 칸을 고르면 접힘) + `Hand` + `PlantBar`(심기 미리보기·뿌리 방향·민들레 씨앗·취소/심기) + 차례 안내·뿌리 수 토글 / 점수 `StatusTab` / 진행 `ProgressTab` / 카드 `CardsTab` / 설명 `HelpTab`) → `TabDock`(`DockShell`). 보드 질감은 `BoardTextures`(SVG 패턴). 카드는 `SpeciesCard`(작은 카드 = 카드 그림 배경 + 이름 + 뿌리 모양 `RootDiagram`, 확대 = 카드 디자인 앞면), 확대(식물·목표 카드)·칸 정보는 `GameModal`. 화면용 파생값은 `game/derived.ts`(엔진 호출만: 칸 `buildCells`, 심을 칸 `legalKeys`, 미리보기 `previewPlant`, 서로 다른 회전 `distinctRotations`). 효과음·차례 알림 `lib/cues.ts`, 웹 성능 `lib/vitals.ts`, 제한 시간 표시 `lib/turnClock.ts`. Vitest 15개.
- **카드 디자인**(2026-10-08 사용자 제공, SVG): 식물 `client/public/cards/plants/<종 id>.svg`(630×880)·목표 `goals/<목표 id>.svg`(880×630)·각 `back.svg`. 작은 카드 배경은 그림 부분만 자른 `plants/art/<종 id>.webp`(`node scripts/card-thumbs.mjs` 로 생성). 경로는 `client/src/game/cardImages.ts`, 파일 누락은 `cardImages.test.ts`. 카드 안 글자는 `notes/Cards.md` 와 맞춘다(`client/public/cards/README.md`).
- 개발용 바로가기: `/hotseat?quick&players=<2~4>&seed=<n>&play=<n>&tab=<board|status|progress|cards|help>&select=<손 카드 index>&cell=<합법 칸 index>&take=<마켓 index|pile>&modal=<손 카드 index>` (`play=<n>` = 자동 수로 n번 둔 뒤 시작, 중반·마켓 빈 화면 확인용).
- localStorage 키 접두어는 옛 이름 `astraltab.` 을 그대로 쓴다(닉네임·재접속 토큰·튜토리얼 표시 유지).

---

## 다음에 이어서 할 일 (2026-10-17 기준)

- 오프라인판(v3, 2인 큐브 16 = v5)은 2026-10-17 main 에 병합해 운영에 배포했다(뿌리 수 배지·심기 확인 바 UI 리뷰 항목 수정 포함).
- 할 일 목록과 중단된 실험은 `notes/Contest.md` 4절. 요약: 종이 프로토타입, 규칙서 그림, 기획안, 신청서 접수(12-31 마감).
- 밸런스 시뮬레이터는 `shared/scripts/lab`(옛 v2 `garden-sim.ts` 는 2026-10-29 삭제, git 기록과 브랜치 `wip/garden-sim-new-flow` 에만 있다).
- 리뷰에서 남은 낮은 항목: 바닥 층(테두리·줄눈·질감)을 미리 구운 이미지로 바꿔 모바일 다시 그리기 비용 줄이기(HexBoard), RevealPanel 의 px 간격 일부 토큰화.

## 실행 환경 (dev / 운영)

| 환경 | 위치 | 서버 | 클라이언트 | AI | 용도 |
|---|---|---|---|---|---|
| dev | 로컬 PC, `/dev` · `/dev-stop` | 3101 (tsx watch) | 5173 (Vite, proxy) | 8000 (`--reload`) | 로컬 개발. 핫리로드. 다른 기기·친구는 Cloudflare 빠른 터널 주소(`/dev` 출력의 `Public` 줄, `.dev/tunnel-url.txt`, 띄울 때마다 바뀜, `-NoTunnel` 로 끔) |
| 운영 | **AWS EC2 상시 서버** | 3201 (systemd `astraltab-prod-server`) | `client/dist/prod` 를 3201에서 정적 서빙 | 8001 (systemd `astraltab-prod-ai`) | 친구들이 접속하는 **유일한 서버**. `main` push 시 자동 배포 |

- 2026-09-28 사용자 지시로 서버를 AWS EC2 상시 서버로 옮겼고, 2026-09-29 test/prod 구분을 없애 단일 운영 서버로 통일했다 — GitHub `main` push 가 곧 운영 배포다. systemd 서비스명·`~/AstralTab` 경로·`dist/prod`·`data/prod` 는 예전 이름을 그대로 둔 것이다. `/prod-server` 스킬은 push 없이 수동 재배포할 때만 쓴다.
- **AWS 인프라**: 리전 서울(`ap-northeast-2`), EC2 **t4g.nano** (ARM, 메모리 0.5GB, 스왑 2GB — `scripts/aws/swap.sh`; 2026-10-02 사용자 지시로 **Eleven·MagicAcademy와 인스턴스 1대를 공유**. 포트: Eleven 3001 / MagicAcademy 8080 / Rootbound 3201, 한 번에 한 게임만 플레이하는 전제) Amazon Linux 2023, Elastic IP(`.dev/aws-public-ip.txt`, git 제외). 도메인 없이 `http://<Elastic IP>:3201`. 보안 그룹은 22(SSH, 관리자 IP만)·3201 만 연다. SSH 키(`.dev/astraltab-key.pem`)와 인스턴스 id(`.dev/aws-instance-id.txt`)도 `.dev/`(gitignore)에 있다.
- GitHub 저장소가 비공개라 EC2에서 `git clone`/`pull` 하지 않는다. 로컬에서 `git archive`로 패키징해 ssh로 전송한다(`scripts/deploy-aws.ps1`). 클라이언트 빌드(vite)는 CI 러너(수동 배포는 로컬)에서 하고 `client/dist/prod` 만 전송한다. EC2에서는 server·shared 의존성 설치와 systemd 재시작만 한다.
- **수동 배포**: `powershell -File scripts/deploy-aws.ps1`. 최초 1회 인스턴스 준비는 `scripts/aws/provision.sh` → `scripts/aws/units.sh`.
- **`main`에 push되면 GitHub Actions(`.github/workflows/deploy-aws.yml`)가 테스트·타입 검사·pytest(`verify` job) 통과 후 EC2에 자동 배포한다.** 검증 전 변경은 별도 브랜치에 둔다. 워크플로는 SSH(22)에 러너 IP를 배포 직전에 임시로 추가했다가 제거한다(최소 권한 IAM 사용자 `astraltab-ci`). 필요한 Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_SECURITY_GROUP_ID`, `EC2_HOST`, `EC2_SSH_PRIVATE_KEY`(선택 `EC2_HOST_KEY`). 수동 배포는 `astraltab-key.pem`, CI는 별도 키(`astraltab-github-actions`)를 쓴다.
- 서버 환경 변수: `APP_ENV`, `PORT`, `HOST`, `CLIENT_DIST`, `DATA_DIR`, `AI_BASE_URL` (`server/src/index.ts` 주석, EC2는 systemd unit 에 박혀 있다). 스냅샷은 EC2 `~/AstralTab/server/data/prod/rooms`, 판 요약·웹 성능은 `.../prod/stats`.

---

## 기술 스택 (확정)

| 영역 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript + Python | 서버·클라이언트·공용 타입은 TS, AI 서비스는 Python |
| 백엔드 | Node.js 22 + Express + Socket.io | 포트 `3101` |
| 프론트엔드 | React 18 + Vite + Zustand | 포트 `5173`, `/api`·`/socket.io`는 Vite proxy로 3101에 연결 |
| 스타일 | CSS Modules | 탭 전환 시 언마운트 대신 `hidden` 전환 |
| 보드 렌더 | SVG | 축 좌표 육각, viewBox 로 컨테이너에 맞춤 |
| 테스트 | Vitest | 룰 엔진은 순수 함수, 단위 테스트 필수 |
| AI | Python 3.11 + FastAPI | 포트 `8000`. Node 서버가 AI 차례마다 HTTP로 호출 |
| Python 실행 | `ai/.venv` | PC의 Python 3.11.7은 PATH에 없다. `scripts/dev.ps1`이 `C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe`로 venv를 만든다 |
| 저장소 | **없음** | 인메모리 + JSON 파일 스냅샷 + JSONL 통계 |
| 패키지 관리 | npm workspaces (`@rootbound/shared`·`server`·`client`) | `npm install`은 루트에서 한 번. `node_modules/@rootbound/*` 가 링크가 아니라 복사본이 되면 예전 코드로 테스트가 돈다 — 이상하면 `rm -rf node_modules/@rootbound && npm install` |

## 디렉터리 구조

```
AstralTab/                 # 저장소 폴더 이름은 아직 옛 이름
├── CLAUDE.md
├── DESIGN.md
├── package.json          # npm workspaces: shared, server, client (이름 rootbound)
├── notes/Rules.md        # 규칙 정본
├── scripts/              # common.ps1, dev.ps1, dev-stop.ps1, deploy-aws.ps1, card-thumbs.mjs(카드 그림 썸네일), aws/(provision.sh, units.sh, deploy-remote.sh, swap.sh)
├── shared/
│   ├── fixtures/         # specs.json, scenario.json (TS 엔진 출력, Python 테스트가 읽는다)
│   ├── scripts/          # lab/(v3 밸런스 시뮬레이터), write-fixtures.ts
│   └── src/
│       ├── types/        # GameState, PlayerState, Plant, Board, Action, events
│       ├── data/         # constants.ts, species.ts(식물 9종·목표 16장), tiles.ts(정원 조각)
│       ├── engine/       # board, influence, scoring, turn, rng (순수 함수)
│       └── mask.ts       # 손 카드·카드 더미 가림
├── server/
│   ├── scripts/stats.ts  # 판 요약·웹 성능 집계
│   └── src/
│       ├── index.ts      # Express + Socket.io, 방별 타이머, /api/vitals
│       ├── rooms/        # 방·로비·자리·제한 시간·AI 대리(manager), 요청·스냅샷 모양 검사(validate), 판 요약(record)
│       ├── game/         # AI 차례 실행기
│       ├── ai/           # AI 서비스 HTTP 클라이언트 (타임아웃·자동 수 폴백)
│       └── persistence/  # JSON 스냅샷, 통계 JSONL (DB 아님)
├── client/
│   ├── public/cards/     # 카드 디자인 SVG: plants/(식물 9 + back, art/ 썸네일), goals/(목표 16 + back)
│   └── src/
│       ├── pages/        # LandingPage, SetupPage(핫시트), RoomPage(로비), GamePage, ResultOverlay
│       ├── tabs/         # BoardTab, StatusTab, ProgressTab, CardsTab, HelpTab
│       ├── components/   # HexBoard, SpeciesCard, RootDiagram, Hand, PlantBar, Market, GoalList, GameModal, PlayerStrip, TabDock, TurnTimer, TurnEvents, TutorialCoach, GameMenu …
│       ├── game/         # hotseat.ts, derived.ts, tutorialBot.ts, useGameCues.ts, cardImages.ts
│       ├── store/        # Zustand 전역 상태
│       ├── lib/          # cues, vitals, turnClock, identity, router, onboarding …
│       ├── socket/       # Socket.io 클라이언트
│       └── styles/       # tokens.css, global.css
└── ai/                   # Python AI 서비스 (패키지 astral_ai)
    └── astral_ai/        # main.py, models.py, rules.py, search.py
```

---

## DB 없는 상태 관리

- **단일 진실 공급원은 서버 메모리**의 방 맵이다(`RoomManager`).
- 클라이언트는 게임 상태를 직접 계산하지 않는다. 액션(`READY`, `CONFIRM`, `TAKE`, `PLANT`, `DISCARD`, `SURRENDER`)을 보내고 서버가 브로드캐스트한 상태로 덮어쓴다. 합법 칸 하이라이트·심기 미리보기처럼 UI 편의를 위한 계산은 `shared/src/engine` 의 순수 함수를 그대로 쓴다(중복 구현 금지).
- **손 카드는 비공개다.** 본인 손 카드만 내용을 보내고 타인은 장수만. 카드 더미 순서·RNG 시드는 누구에게도 보내지 않는다(더미는 `pileCount` 장수만). 이번 판 식물·마켓·가져간 카드는 공개다.
- **자동 저장·복구**: 상태가 바뀔 때마다 `server/data/<env>/rooms/<roomId>.json` 에 방을 통째로 쓰고, 서버 시작 시 복원한다(진행 중 차례는 시계를 새로 잰다). 예전 게임 형식 스냅샷은 `rooms-legacy/` 로 옮긴다.
- **판 요약·웹 성능**: `server/data/<env>/stats/games.jsonl`·`vitals.jsonl` (파일 크기 상한 있음). `npx tsx server/scripts/stats.ts [DATA_DIR]` 로 완수율·세션 시간·재방문·종/자리 승률·FCP/LCP·동기화 지연·FPS를 집계한다.
- **로그인/회원가입은 없다.** 닉네임과 재접속용 `playerToken`은 브라우저 `localStorage`, 서버는 `roomId + playerToken` 으로 재접속을 식별한다.
- `server/data/` 는 git에 커밋하지 않는다.

---

## AI 서비스 (Python)

- `ai/` 는 독립 FastAPI 프로세스다. Node 서버는 AI 자리(또는 시간 초과로 AI 대리 중인 사람 자리)의 차례가 오면 `POST /decide` 에 상태와 플레이어 id를 보내고, 받은 `Action` 을 **일반 액션과 똑같이 룰 엔진으로 검증**한 뒤 적용한다.
- 권위는 항상 TS 룰 엔진에 있다. 불법 응답·타임아웃(2초, F027)·서비스 다운이면 서버는 엔진의 `autoAction`(맨 앞 카드를 첫 합법 칸에, 가져오기는 마켓 0번)으로 폴백한다. AI 서비스가 죽어도 게임은 멈추지 않는다.
- `ai/astral_ai/rules.py` 는 탐색용 **시뮬레이션 사본**이다. 엔진을 바꾸면 `npm run fixtures` 후 rules.py 를 함께 고치고 pytest 로 맞춘다.
- 요청 `{ "state", "playerId", "timeLimitMs" }` → 응답 `{ "action", "depth", "elapsedMs" }`. 상태 없음(stateless).
- 의존성은 `ai/requirements.txt` 에 고정하고 `ai/.venv` 에 설치한다.
- 다음 과제: 1수 탐욕을 넘어서는 탐색(2인 알파베타, 3~4인 max-n)과 평가 가중치.

---

## 게임 규칙 요약 (자세한 내용은 notes/Rules.md, 2026-10-16 오프라인판)

- **인원** 2~4명(공모전·실물판 2~3명). **보드**는 칸 7개짜리 정원 조각을 대칭으로 이어 붙인다(2인 7조각 49칸 / 3인 13조각 91칸 / 4인 15조각 105칸). 지형: 빈 땅·기름진 땅(목표용)·연못·바위(큐브 못 놓음).
- **준비**: 목표 3장(보호구역 1장 이상) → 이번 판 식물(2·3인 6종, 4인 8종) → 카드 더미(종마다 2인 4 / 3·4인 5장) → 손 1장 + 마켓 2장 → 입구 둘레 6칸에 큐브 1개씩 → 공개 단계 확인.
- **차례**: 마켓 2장 중 1장 `TAKE`(빈자리는 바로 채움) 또는 카드 더미 맨 위 1장 `TAKE take:'pile'`(비공개, 마켓 그대로) → 손 2장 중 1장 `PLANT`(회전 `rotation` 0~5, 민들레는 `seed`) 또는 심을 칸이 없을 때만 `DISCARD`. 라운드 = 모두 한 차례. 다음 선 = 공급처 큐브 최다(동점이면 이번 선 다음 자리부터).
- **심을 칸**: 내 땅, 또는 내 땅·입구와 맞닿은 큐브 없는 빈 칸. 연꽃은 연못 옆 빈 칸이면 어디든.
- **큐브**: 상태 `rootSeat`·`rootCount`(칸별 한 색). 남의 큐브는 1:1로 밀어냄. 1인 큐브 2인 16 / 3인 18 / 4인 16, 모자라면 가장 높은 내 칸(같으면 식물 없는 칸 → 칸 순서)에서 옮김. 버섯은 맞닿은 6칸 남의 큐브 −2.
- **식물 9종**: 잔디, 참나무, 소나무, 칡, 고사리, 민들레(씨앗), 연꽃(연못), 버섯(걷어내기), 무궁화(+1점). 담쟁이·대나무·유채는 확장 후보.
- **종료·점수**: 더미·마켓·손이 모두 비면 끝. 점수 = 땅 + 목표 3장 + 무궁화 + 덤(4인만 0,1,1,1). 순위: 기권 안 함 → 점수 → 땅 → 내 땅 위 식물 → 자리 큰 쪽.
- **온라인 제한 시간**(Rules.md 6.3): 방장이 60초/90초/3분/없음. 넘으면 자동 수, 심기 시간 초과 2번 연속이면 AI 대리.

## 디자인 규칙

**`DESIGN.md` 를 기본으로 작업한다.** UI를 만들거나 바꾸기 전에 반드시 읽는다. 적용 우선순위는 DESIGN.md 자체 규정을 따른다: 사용자 지시 > 저장소 사실 > DESIGN.md > 레퍼런스 영감.

### DESIGN.md에서 그대로 승계하는 것

- **플랫**: `box-shadow` 사용 금지. 구분은 배경색 블록과 여백으로 한다.
- **필 CTA**: 주요 버튼은 50px 라운드 필, 저강조 버튼은 999px 아웃라인 필. 각진 버튼 금지.
- **헤딩은 네이비** `#1a2352`(비게임 화면), 순수 검정 금지.
- **타이포**: 본문·UI는 Pretendard(CDN), 디스플레이는 Gothic A1 900(`--font-display`, 로드 실패 시 Pretendard).
- **간격**: 8px 리듬. 라운드 10px(패널) / 16px(카드) / 24px(큰 컨테이너) / 50px·999px(필).
- **모션**: `motion-fast` 120ms, `motion-standard` 220ms, `motion-slow` 340ms. `prefers-reduced-motion` 존중. 탭 전환은 100ms 예산(F014).
- **상태 문구**: 오류 대신 다음에 할 일을 적는다("내 뿌리가 닿는 빈 칸에만 심을 수 있습니다"). 성공에 이모지 없음. 비활성은 회색 + 투명도.
- **화면 용어**: 화면 용어는 `notes/Rules.md` 2절 "화면 용어" 표를 따른다(코드의 seat → 자리, 손패 → 내 카드 등). 화면에 축 좌표를 보여 주지 않는다. 칸을 가리킬 때는 칸 이름(`C4`, Rules.md 2절 `cellLabels`)을 쓴다(게임 기록·칸 정보·"칸 이름" 토글).
- **보이스**: 선언형·현재형, 짧고 직접적인 CTA("방 만들기", "심기", "기권").

### 컬러 월드

**비게임 화면** (랜딩, 로비, 핫시트 설정): Corca 기업 프레임 — 캔버스 `#ffffff`, 서피스 `#f1f5f9`, 헤딩 `#1a2352`, 본문 `#324158`, 보조 `#bbbbbb`, 주요 CTA `#777cdc`.

**게임 대시보드** (2026-10-07 Rootbound 전환, 사용자 지시로 우주 테마를 걷어내고 밤 정원으로): 값은 `client/src/styles/tokens.css` 의 `[data-world='game']` 과 도메인 색.

| 역할 | 값 |
|---|---|
| 무대 배경 | 밤 정원 녹색 `#0e1a14` + 반딧불·이끼빛 그라데이션(`GamePage.module.css`) |
| 패널·탭 바·카드 | `#1d3328` |
| 활성·주요 버튼·합법 칸·선택 | Moonlight Cream `#fff3b7` |
| 보드 (2026-10-08 시안 `notes/design/board-2p.svg`) | 바깥 테두리 `#2c455d`, 줄눈 `#2a2a1c`, 구역 경계선 `#94bce3` (`--board-*`) |
| 빈 땅 | 풀밭 무늬 `#6b7a3f` + 풀잎 |
| 비옥토(기름진 땅) | 흙 무늬 `#4b3320` + 새싹 |
| 연못 | 물 그라데이션 `#5d93ad`→`#1f4466` + 물결 무늬(자리 0 파랑 땅과 헷갈리지 않게 어둡게) |
| 돌밭(바위) | 자갈 무늬 `#868a8d` + 둥근 돌 두 개 |
| 자리 0~3 | `#419eff` / `#e69f00` / `#00c58e` / `#f178b6` (땅은 자리 색 38% 덮기 + 자리 색 테, 식물은 카드 그림 썸네일 + 자리 색 고리, 입구는 자리 색 집 모양 + 자리 번호) |
| 위험·경고(돌이킬 수 없는 동작) | Danger Red `#e5484d` (연결 끊김, 기권, 10초 이하 남은 시간) |
| 텍스트 | `#ffffff`, 보조 `#b8c4bc` |

### 구현 방식

- 모든 색·간격·라운드·모션 값은 `tokens.css` 의 CSS 변수로만 쓴다. 컴포넌트 CSS에 HEX 직접 기입 금지.
- 게임 화면 루트에 `data-world="game"` 을 두고 변수 값을 덮어써서 두 세계를 전환한다. 두 세계를 한 화면에 섞지 않는다.

### 모바일 우선 (2026-09-22 사용자 지시)

- **화면 폭 고정**: `#root` 가 `max-width: var(--app-max-width)`(480px)로 가운데 정렬. 미디어 쿼리로 폭 분기를 만들지 말고 처음부터 좁은 폭 하나로 설계한다.
- **폰트**: 기본 14px, 최소 12px(`--text-micro`).
- **줄바꿈**: `body { overflow-wrap: anywhere }`.
- **게임 레이아웃**: 위→아래 한 방향. `PlayerStrip` → 탭 내용(정원 탭: 목표 칩 → 보드(남는 높이 전부) → 심기 확인 바 · 손패 · 차례 안내) → `TabDock`.
- 헤드리스 스크린샷 확인 시 `--window-size` 는 522 이상(Chrome 헤드리스 최소 뷰포트 ~504px).

## 코딩 규칙

- 룰 엔진(`shared/src/engine`)은 **부수효과 없는 순수 함수**로 작성한다. `(state, action) => { state, error? }`. 난수는 상태 안의 시드 RNG만, Rules.md 11절 순서대로. 칸 순서는 `r` → `q`.
- 영향력·땅·점수는 파생값이다. 계산 함수가 정본이고, 상태에 캐시하지 않는다.
- 수치는 `shared/src/data` 한 곳에만 둔다. 엔진·UI·AI 어디에도 하드코딩하지 않는다. Rules.md 표와 데이터 일치는 `data.test.ts` 가 검사한다.
- 서버·클라이언트 공용 타입·상수는 `shared/`에만. Socket 이벤트 이름·페이로드는 `shared/src/types/events.ts` 한 곳.
- 탭 컴포넌트는 `React.memo`, 탭 전환으로 언마운트하지 않는다.
- 주요 사건(심기, 가져오기, 땅 뺏기, 버리기, 기권, 차례 전환, 시간 초과, 종료)은 `GameState.log` 에 기록한다.
- 룰 엔진 변경은 Vitest 테스트를 함께 추가하고 `npm run fixtures` 후 pytest를 돌린다.
- 주석과 UI 문구는 한국어, 식별자는 영어. 종·목표 id는 Rules.md의 영문 id를 그대로 쓴다.
- Python 코드는 타입 힌트 필수, `rules.py`·`search.py` 는 순수 함수. 테스트는 pytest.

## 자주 쓰는 명령

| 목적 | 방법 |
|---|---|
| 서버·클라이언트·AI 백그라운드 실행 (개발) | `/dev` |
| 백그라운드 프로세스 종료 (개발) | `/dev-stop` |
| AWS 서버에 배포 | `main` push 시 자동. 수동은 `powershell -File scripts/deploy-aws.ps1` |
| AWS 서버 로그 확인 | `ssh -i .dev/astraltab-key.pem ec2-user@$(cat .dev/aws-public-ip.txt) "sudo journalctl -u astraltab-prod-server -n 100"` |
| 로그 확인 (dev) | `tail -n 50 .dev/server.log`, `.dev/client.log`, `.dev/ai.log` |
| 의존성 설치 (JS) | `npm install` (루트) |
| 의존성 설치 (Python) | `ai\.venv\Scripts\pip install -r ai\requirements.txt` |
| 테스트 (JS) | `npm test` (루트, 전 워크스페이스) |
| 테스트 (Python) | `ai\.venv\Scripts\python -m pytest ai/tests` |
| 공용 픽스처 재생성 | `npm run fixtures` (엔진·데이터·타입을 바꾸면 반드시 실행 후 pytest) |
| 카드 SVG 문구·뿌리 그림 다시 그리기 | `node scripts/card-text.mjs` (fixtures 를 먼저 만든 뒤) |
| 밸런스 시뮬레이션 (v3) | `npx tsx shared/scripts/lab/run.ts <변형> [인원=2,3,4] [배율]` (5개 지표 점수표), 여러 변형 비교 `lab/sweep.ts`, 정본 엔진 일치 `lab/parity.ts`, 저장 결과 재채점 `lab/rescore.ts`. 변형은 `lab/registry.ts`, 지금 규칙 = `v6`(v5 + 마켓 2장 + 더미 뒷면 가져오기) |
| 타입 검사 | `npm run typecheck` (shared·shared/scripts·server·client) |
| 플레이어 지표 집계 | `npx tsx server/scripts/stats.ts [DATA_DIR]` (기본 `server/data/prod`). 운영은 EC2에서 `cd ~/AstralTab && npx tsx server/scripts/stats.ts server/data/prod` |
| 커밋 & 푸시 | `/commit-push` |

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `spec-checker` | 구현 결과를 Rules.md·CLAUDE.md 요구에 대조 |
| `rules-engine-reviewer` | 룰 엔진(보드·영향력·이번 판 식물·라운드 마켓·차례·점수)의 순수성·결정성·Rules.md 일치·엣지 케이스 검토 |
| `realtime-sync-reviewer` | Socket.io 이벤트, 손패 비공개, 재접속, 제한 시간·AI 대리, 스냅샷 복구 검토 |
| `ui-tab-reviewer` | 탭 UI 성능(100ms), 무스크롤 레이아웃, 보드·내 카드·마켓 렌더, 리렌더 검토 |
| `ai-reviewer` | Python AI 서비스의 규칙 일치, 합법성, 시간 제한, 스키마 검토 |

기능 구현을 마치면 `spec-checker`로 확인하고, 영역에 맞는 리뷰어를 거친 뒤 `/commit-push`한다.
