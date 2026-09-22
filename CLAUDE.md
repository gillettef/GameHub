# AstralTab

웹 브라우저에서 친구 2~4명과 즐기는, **바둑처럼 마커를 놓아 영토를 넓히는** 카드 기반 우주 전략 보드게임 플랫폼. 마커는 한 번 놓으면 이동하지 않지만, 한 턴에 에너지가 허락하는 한 여러 개를 놓을 수 있다(2026-09-22 변경).
보드 / 상태 / 진행 세 개의 탭으로 화면을 나누고, 스크롤 없이 한 화면에서 대국을 진행한다.

**게임 규칙의 정본은 `notes/Rules.md` 다.** 룰 엔진·AI·UI·명세서 어디든 규칙이 어긋나면 Rules.md가 맞다. 규칙을 바꿀 때는 Rules.md를 먼저 고친다.

기획 문서는 `notes/`에 있다. 기능을 구현하기 전에 반드시 해당 F-ID의 수락 기준과 Rules.md의 해당 절을 확인한다.

| 문서 | 내용 |
|---|---|
| `notes/Rules.md` | **규칙 정본**. 용어, 턴 진행, 배치·시야·전투·점수, 카드 29종, 맵 6개, 상수, 결정성 규칙 |
| `notes/Rule.pdf` | Rules.md를 플레이어에게 쉬운 말로 풀어 쓴 규칙 설명서(PDF, 표지·차례·카드 표·맵 그림 포함). `scripts/build-rulebook.py`로 생성. 정본이 아니라 파생 문서이므로 Rules.md를 고치면 이 문서도 다시 만든다 |
| `notes/PRD_AstralTab_*.md` | 제품 목표, 타겟, 시나리오, KPI, 리스크 |
| `notes/기능명세서_AstralTab_*.md` | F001~F031 기능 ID, 설명, 수락 기준, 중요도 |
| `notes/구현방법_AstralTab_*.md` | 실시간 동기화, 탭 전환 성능, 시야·전투·점수 판정, 다인전 AI 탐색 |
| `notes/추진로드맵_AstralTab_*.md` | Phase 1~3 범위 |
| `notes/유저플로우_AstralTab_*.md` | v1 유저 플로우 다이어그램 (base64 PNG). "로그인"은 닉네임 입력, "유닛 이동"은 없어졌다 |
| `notes/image/Rules/` | v1 규칙 초안 메모 이미지. Rules.md와 어긋나면 Rules.md 우선 |

---

## 필수 작업 규칙

1. **작업이 완료되면 반드시 `git commit` & `git push`를 진행한다.** 기능 하나, 버그 수정 하나 등 의미 있는 단위가 끝날 때마다 커밋하고 푸시한다. `/commit-push` 스킬을 사용한다.
2. **commit 메시지는 가급적 한국어로 작성한다.** 제목은 `<타입>: <요약>` 형식 (예: `기능: 로비 초대 링크 생성 (F001)`, `수정: 전투 대상 선택 순서 오류 (F023)`). 관련 F-ID가 있으면 괄호로 덧붙인다.
3. **push 대상 repo는 `https://github.com/gillettef/AstralTab.git` 이다.** 브랜치는 `main`을 기본으로 사용한다.
4. **이 서비스는 DB를 사용하지 않는다.** notes/ 문서에 "데이터베이스", "Redis" 등이 남아 있어도 DB·Redis·ORM을 도입하지 않는다. 아래 "DB 없는 상태 관리" 참고.
5. 로컬 테스트 시 서버를 포그라운드로 직접 띄우지 않는다(터미널이 블로킹됨). 반드시 `/dev`로 시작하고 `/dev-stop`으로 종료한다. `scripts/dev.ps1` 출력을 `| grep` 등 다른 프로세스로 파이프하지 않는다.
6. 포트 3001은 이 PC에서 사용자의 다른 프로젝트(Eleven)가 쓴다. AstralTab 서버는 3101을 쓰며, 3001을 점유한 프로세스는 절대 종료하지 않는다.
7. **규칙 변경은 세 곳을 함께 고친다**: `notes/Rules.md` → `shared/src/engine` + `shared/src/data` (Vitest) → `ai/astral_ai/rules.py` (pytest, 공용 픽스처). 기능명세서의 수락 기준도 맞춘다.

---

## 코드 현황 (2026-09-22)

- `shared/src`(types·data·engine), `ai/astral_ai`(models·rules·search), `shared/fixtures` 는 **v2 규칙(Rules.md)** 으로 재작성됐다. 2026-09-22 육각 전환(odd-r 오프셋, `hexDistance`/`hex_distance`, 코어 시야·수입 1)까지 반영. Vitest 70개(맵 6개 좌석 공정성 테스트 포함), pytest 14개(픽스처 시나리오 재생으로 TS·Python 규칙 일치 검증)가 통과한다.
- `ai/astral_ai/search.py` 는 1수 탐욕 자리표시자다. Minimax / max-n 은 Phase 3.
- `client/` 는 **Phase 1 탭 UI 핫시트**가 구현됐다 (F008~F017). 설정 화면(참가 인원 → 맵(인원수로 필터) → 닉네임 → 덱 빌딩) → 게임 대시보드(보드·상태·진행 탭) → 결과 오버레이. 규칙 계산은 `client/src/game/hotseat.ts` 가 `shared/src/engine` 의 `applyAction` 을 직접 호출하는 로컬 어댑터로 처리하며, Phase 2 에서 Socket.io 어댑터(`client/src/socket`)로 교체한다. 개발용 바로가기 `/?quick&map=<id>&seed=<n>&tab=<board|status|progress>&select=<손패 index>`. Vitest 10개(client).
- 보드는 `Board.tsx`/`Board.module.css` 가 육각(odd-r, pointy-top)으로 렌더링한다. 컨테이너 가로·세로에 맞춰 육각 크기를 계산해 무스크롤(F015)·모바일을 함께 만족한다. 마커는 좌석 색으로 채우고 모양(코어=육각·건물=둥근 사각·유닛=원·마법=마름모)으로 종류를 구분한다(좌석 1·2·3 색 확정, 흰색 패턴 구분은 폐기). 경고색은 여전히 **미정**이다.
- 화면은 모바일 우선이다: 본문 14px/최소 12px, `max-width:720px` 에서 `BoardTab`·`Hand`·`StatusTab`·`GamePage` 헤더가 레이아웃을 바꾼다. 자세한 내용은 아래 "모바일 우선" 절.
- **Phase 2 온라인 멀티플레이 + AI 좌석**이 구현됐다 (F001~F007, F026, F027, F030). 서버 `rooms/manager.ts`(방 생성·초대 id·비밀번호·좌석·맵 변경·AI 추가, 순수 로직 + Vitest 9개), `persistence/snapshots.ts`(`server/data/<env>/rooms/<roomId>.json`, 시작 시 복원), `game/aiTurn.ts`(AI 턴마다 Python `/decide` 호출 → 엔진 검증 → PASS 폴백), `index.ts`(Socket.io ack 이벤트, 플레이어별 `maskState` 브로드캐스트). 이벤트 계약은 `shared/src/types/events.ts`, 가림 함수는 `shared/src/mask.ts`.
- 클라이언트 경로: `/` 랜딩(방 만들기·초대 링크 참여·핫시트), `/hotseat` 핫시트 설정→게임, `/room/:id` 온라인 로비→게임. 소켓 어댑터 `client/src/socket/client.ts`, 스토어는 `mode: hotseat | online` 으로 같은 액션을 쓴다. 재접속은 localStorage `playerToken` (`client/src/lib/identity.ts`).
- AI 탐색은 아직 1수 탐욕(`ai/astral_ai/search.py`). Minimax / max-n, 평가 함수 가중치(F028, F029)는 다음 작업. 로비의 자동 시작(전원 준비 시 엔진 `ready()` 가 시작)은 F002 의 "방장 시작 버튼"과 다르므로 필요하면 엔진에 START 액션을 추가한다.

---

## 실행 환경 (dev / test / prod)

| 환경 | 시작 / 종료 | 서버 | 클라이언트 | AI | 용도 |
|---|---|---|---|---|---|
| dev | `/dev` · `/dev-stop` | 3101 (tsx watch) | 5173 (Vite, proxy) | 8000 (`--reload`) | 로컬 개발. 핫리로드 |
| test | `/test-server` · `/test-server-stop` | 3301 | `client/dist/test` 를 3301에서 정적 서빙 | 8002 | 친구와 검증. 운영 전 확인 |
| prod | `/prod-server` · `/prod-server-stop` | 3201 | `client/dist/prod` 를 3201에서 정적 서빙 | 8001 | 친구들이 접속하는 운영 |

- test·prod 는 `scripts/serve.ps1 -Env <env>` 가 클라이언트를 빌드하고, Node 서버·AI·**Cloudflare 빠른 터널**(`.dev/bin/cloudflared.exe`, 자동 다운로드)을 띄운다. 공개 주소(`https://….trycloudflare.com`)는 `.dev/<env>-url.txt` 에 저장되며 **재시작마다 바뀐다**.
- 서버는 환경 변수 `APP_ENV`, `PORT`, `HOST`, `CLIENT_DIST`, `DATA_DIR`, `AI_BASE_URL` 로 설정한다 (`server/src/index.ts` 주석). JSON 스냅샷 디렉터리는 `server/data/<env>`.
- 공용 함수는 `scripts/common.ps1`. 종료 스크립트는 pid 파일 기준이며 포트 폴백은 이 프로젝트 프로세스만 대상으로 한다.
- 세 환경은 포트가 겹치지 않아 동시에 띄울 수 있다. test·prod 는 핫리로드가 없으므로 코드 변경 후 종료 → 시작으로 재배포한다.

---

## 기술 스택 (확정)

| 영역 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript + Python | 서버·클라이언트·공용 타입은 TS, AI 서비스는 Python |
| 백엔드 | Node.js 22 + Express + Socket.io | 포트 `3101` |
| 프론트엔드 | React 18 + Vite + Zustand | 포트 `5173`, `/api`·`/socket.io`는 Vite proxy로 3101에 연결 |
| 스타일 | CSS Modules | 탭 전환 시 언마운트 대신 `display:none`/`visibility` 전환 |
| 테스트 | Vitest | 룰 엔진은 순수 함수로 작성하고 단위 테스트 필수 |
| AI | Python 3.11 + FastAPI + Minimax / max-n | 포트 `8000`. Node 서버가 AI 턴마다 HTTP로 호출 |
| Python 실행 | `ai/.venv` | PC의 Python 3.11.7은 PATH에 없다. `scripts/dev.ps1`이 `C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe`로 venv를 만든다 |
| 저장소 | **없음** | 인메모리 + JSON 파일 스냅샷 |
| 패키지 관리 | npm workspaces | `npm install`은 루트에서 한 번 |

## 디렉터리 구조 (목표)

```
AstralTab/
├── CLAUDE.md
├── DESIGN.md
├── package.json          # npm workspaces: server, client, shared
├── notes/                # 기획 문서. Rules.md가 규칙 정본
├── scripts/              # common.ps1, dev.ps1, dev-stop.ps1, serve.ps1, serve-stop.ps1
├── shared/               # 서버·클라이언트 공용 타입, 카드·맵 데이터, 룰 엔진
│   ├── fixtures/         # TS 엔진 출력 JSON. Python 테스트가 같은 파일을 읽는다
│   └── src/
│       ├── types/        # GameState, Player, Marker, Card, Map, Action, events
│       ├── data/         # cards.ts (기본 22 + 특수 9), maps.ts (6개), constants.ts
│       └── engine/       # 순수 함수 룰 엔진
│           ├── sight.ts      # 시야 영역, 영토 소유자
│           ├── placement.ts  # 배치 검증·적용, 즉발 마법
│           ├── combat.ts     # 턴 시작 자동 공격, 파괴·탈락
│           ├── scoring.ts    # 점수, 순위, 종료 조건
│           ├── turn.ts       # 시작 단계 → 행동 → 종료 단계, applyAction
│           └── rng.ts        # 시드 RNG, 셔플
├── server/
│   └── src/
│       ├── index.ts      # Express + Socket.io 부트스트랩
│       ├── rooms/        # 방 생성, 초대 링크, 비밀번호, 로비, 맵 선택, 좌석
│       ├── game/         # 룸별 게임 루프, 액션 → engine → 손패 가린 브로드캐스트
│       ├── ai/           # AI 서비스 HTTP 클라이언트 (타임아웃·PASS 폴백)
│       └── persistence/  # JSON 파일 스냅샷 저장/복구 (DB 아님)
├── client/
│   └── src/
│       ├── pages/        # SetupPage(맵·닉네임·덱 빌딩), GamePage(헤더·탭 바), ResultOverlay
│       ├── tabs/         # BoardTab(격자+손패+패스), StatusTab, ProgressTab
│       ├── components/   # Board, Cell, Hand, CardFace, TurnControls
│       ├── game/         # hotseat.ts(로컬 어댑터), derived.ts(화면용 파생값, 엔진 호출만)
│       ├── store/        # Zustand 전역 상태 (모든 탭 데이터 선로드)
│       ├── lib/          # cx 등 작은 유틸
│       ├── socket/       # Socket.io 클라이언트, 재연결 처리 (Phase 2)
│       └── styles/       # tokens.css, global.css
└── ai/                   # Python AI 서비스 (FastAPI, 포트 8000)
    ├── pyproject.toml
    ├── requirements.txt
    ├── astral_ai/
    │   ├── main.py       # FastAPI 앱, POST /decide
    │   ├── models.py     # GameState/Action Pydantic 모델 (shared/src/types 와 1:1)
    │   ├── rules.py      # 탐색용 규칙 시뮬레이션 (legal_actions, apply)
    │   ├── evaluate.py   # 보드 평가 함수 (점수, 에너지·수입, 코어 위협, 사거리 내 적)
    │   └── search.py     # 2인 알파베타 Minimax, 3~4인 max-n, 반복 심화, 시간 제한
    └── tests/            # pytest
```

디렉터리가 아직 없다면 위 구조로 생성한다. 구조를 바꿀 경우 이 문서도 함께 갱신한다.

---

## DB 없는 상태 관리

- **단일 진실 공급원은 서버 메모리**의 `Map<roomId, GameState>` 이다.
- 클라이언트는 절대 게임 상태를 직접 계산하지 않는다. 액션(`PLACE`, `PASS`, `SURRENDER`)을 보내고 서버가 브로드캐스트한 전체 상태로 덮어쓴다. 배치 가능 칸 하이라이트처럼 UI 편의를 위한 계산은 `shared/src/engine` 의 순수 함수를 그대로 가져다 쓴다(중복 구현 금지).
- **손패는 비공개다.** 서버는 플레이어별로 상태를 가려서 보낸다. 본인 손패만 내용을 포함하고, 타인은 장수만 보낸다. 덱 순서는 누구에게도 보내지 않는다.
- **자동 저장(F006)·복구(F007)** 는 `server/data/rooms/<roomId>.json` 에 턴 종료 시점마다 `GameState`를 통째로 직렬화하여 구현한다. 서버 재시작 시 이 디렉터리를 읽어 메모리에 복원한다.
- **비동기 턴 모드(F005)** 도 같은 JSON 스냅샷으로 유지한다. 별도 큐·DB 없음.
- **로그인/회원가입은 없다.** 닉네임과 재접속용 `playerToken`은 브라우저 `localStorage`에 보관하고, 서버는 `roomId + playerToken` 으로 재접속 플레이어를 식별한다.
- `server/data/` 는 git에 커밋하지 않는다(`.gitignore`).

---

## AI 서비스 (Python)

- `ai/` 는 독립 FastAPI 프로세스다. Node 서버는 AI 플레이어의 턴이 오면 `POST http://localhost:8000/decide` 에 현재 `GameState`(AI 본인 손패 포함, 1차 구현에서는 전체 상태)와 AI 플레이어 id를 보내고, 응답으로 받은 `Action` 하나를 **일반 플레이어 액션과 동일하게 룰 엔진으로 검증**한 뒤 적용한다.
- 권위는 항상 TS 룰 엔진(`shared/src/engine`)에 있다. AI 응답이 불법 액션이거나 타임아웃(2초, F027)이면 서버는 `PASS` 로 폴백하고 로그에 남긴다. AI 서비스가 죽어 있어도 게임이 멈추면 안 된다.
- `ai/astral_ai/rules.py` 는 탐색을 위한 **시뮬레이션 사본**이다. `shared/src/engine` 과 규칙이 어긋나면 AI가 불법 수를 두게 되므로, 룰 엔진을 바꾸면 반드시 `rules.py` 도 함께 고치고 양쪽에 같은 JSON 픽스처(`shared/fixtures/*.json`)로 테스트한다.
- `ai/astral_ai/models.py` 의 Pydantic 모델은 `shared/src/types` 와 필드명·타입을 1:1로 맞춘다.
- 탐색: 2인전은 알파베타 Minimax, 3~4인전은 max-n(각 노드의 턴 플레이어가 자기 평가값을 최대화). 둘 다 반복 심화로 `timeLimitMs` 안에 마지막 완료 깊이의 수를 돌려준다. 배치 후보는 시야 영역 안 칸으로 한정하고, 카드 종류별로 상위 몇 칸만 확장해 분기를 줄인다.
- 요청·응답 스키마:
  - 요청: `{ "state": GameState, "playerId": string, "timeLimitMs": number }`
  - 응답: `{ "action": Action, "depth": number, "elapsedMs": number }`
- 상태 없음(stateless). AI 서비스는 아무것도 저장하지 않는다.
- 의존성은 `ai/requirements.txt` 에 고정하고 `ai/.venv` 에 설치한다.
- 행동 우선순위(F028, F029)는 `evaluate.py` 가중치로 표현한다: 점수(영토+마커) 차이, 에너지·수입, 코어 위협도(코어 반경 3 안 적 공격력 합), 사거리 안 적 마커 수, 광맥 점유. 초반 라운드는 수입 가중치를 높인다.

---

## 게임 규칙 요약 (자세한 내용은 notes/Rules.md)

- **플레이어** 2~4명, 좌석 순서대로 턴. **맵** 6개(2인 2 / 3인 2 / 4인 2), 11×11 / 13×13 / 15×15 육각 타일(odd-r 오프셋). 지형은 빈 우주·소행성(배치 불가)·광맥(건물 생산 +1).
- **시작**: 코어가 맵 지정 좌표에 자동 배치(F018). 덱 = 기본 22 + 특수 3(덱 빌딩 F016), 시드 셔플, 손패 4, 에너지 5(F019).
- **턴 시작(자동)**: 전투 → 정비 → 지속 마법 만료 → 수입(코어 1 + 건물 생산) → 드로우 1(손패 상한 5). (F020, F023)
- **행동**: 손패 카드로 마커 배치(에너지가 허락하는 한 한 턴에 여러 번) / 패스·턴 종료 / 기권. 이번 턴에 하나도 안 놓고 턴을 넘기면 패스로 기록된다. (F013, F022)
- **배치 조건**: 손패 보유, 에너지 ≥ 비용, 빈 칸, 소행성 아님, **내 시야 영역 안**(침투 카드는 적 인접도 가능). (F022)
- **시야**: 마커별 육각 거리 반경(코어는 1). 시야 영역의 합집합이 배치 범위이자 영토의 근거. (F031)
- **영토**: 정확히 한 플레이어의 시야 안인 빈 칸 + 마커 칸. 경합·소행성은 무소유. 1칸 1점.
- **전투**: 턴 플레이어의 공격력 있는 마커가 사거리 안 적 하나를 자동 공격. 대상은 거리→체력→y→x 순. 동시 피해, 한꺼번에 제거. 마커는 이동하지 않는다. (F023)
- **파괴**: 체력 0 이하 → 제거, 시야·생산·점수 즉시 소멸(F021). 코어 파괴 → 탈락, 마커 전부 제거. 생존자 1명 → 즉시 승리(F024).
- **종료·점수**: 전원 연속 패스 또는 맵 라운드 제한 → 점수(영토 + 마커) 순위. 동점은 좌석 번호 큰 쪽. 탈락자는 하위. (F025)
- **탭 UI**: 보드(F008, F009: 격자·시야·영토·손패·패스) / 상태(F010, F011: 에너지·비용·시야·점수) / 진행(F012, F013). 탭 전환 100ms 이내(F014), 데스크톱에서 수직 스크롤 없음(F015).
- **멀티플레이**: 초대 링크(F001), 로비·좌석(F002), 비밀번호(F003), 맵 선택(F030), Socket.io 0.5초 이내(F004).
- **AI**: AI 좌석(F026), 2초 이내 결정(F027), 경제 우선(F028), 공격·방어 전환(F029).

## 로드맵 순서

1. **Phase 1**: 룰 엔진 재작업 + 카드·맵 데이터 + 탭 UI 핫시트 (F008~F025, F031)
2. **Phase 2**: 로비·맵 선택·초대, Socket.io 동기화, JSON 스냅샷 저장·복구, 비동기 턴 (F001~F007, F030)
3. **Phase 3**: AI 대전(2인 Minimax, 3~4인 max-n), 밸런스 조정 (F026~F029)

---

## 디자인 규칙

**`DESIGN.md` 를 기본으로 작업한다.** UI를 만들거나 바꾸기 전에 반드시 읽는다. 적용 우선순위는 DESIGN.md 자체 규정을 따른다: 사용자 지시 > 저장소 사실 > DESIGN.md > 레퍼런스 영감.

### DESIGN.md에서 그대로 승계하는 것

- **플랫**: `box-shadow` 사용 금지. 구분은 배경색 블록과 여백으로 한다.
- **필 CTA**: 주요 버튼은 50px 라운드 필, 저강조 버튼은 999px 아웃라인 필. 각진 버튼 금지.
- **헤딩은 네이비** `#1a2352`, 순수 검정 금지(검정은 얇은 아웃라인에만).
- **타이포**: 본문·UI는 Pretendard(CDN), 본문 15~17px. 헤딩용 디스플레이 폰트는 **미정**. 정해지기 전까지 헤딩도 Pretendard 700으로 두고 폰트 패밀리는 CSS 변수 하나(`--font-display`)로만 참조한다.
- **간격**: 8px 리듬. 라운드는 10px(패널) / 16px(카드) / 24px(큰 컨테이너) / 50px·999px(필).
- **모션**: `motion-fast` 120ms, `motion-standard` 220ms, `motion-slow` 340ms와 DESIGN.md의 easing 토큰. `prefers-reduced-motion` 존중. 탭 전환은 100ms 예산(F014) 때문에 `motion-fast` 이하로만.
- **상태 문구**: 오류는 "오류"가 아니라 다음에 할 일을 적는다("에너지가 2 부족합니다", "시야 밖입니다"). 성공에 이모지 없음. 비활성은 회색 `#bbbbbb` 텍스트 + 투명도.
- **보이스**: 선언형·현재형, 짧고 직접적인 CTA("방 만들기", "패스", "기권").

### AstralTab 컬러 월드 (DESIGN.md "A world per product" 적용)

화면을 두 세계로 나눈다. 값은 모두 DESIGN.md 팔레트에서 가져온다.

**비게임 화면** (랜딩, 로비, 덱 빌딩, 결과): Corca 기업 프레임 그대로.

| 역할 | 값 |
|---|---|
| 캔버스 | `#ffffff` |
| 서피스·패널 | `#f1f5f9` |
| 헤딩 | `#1a2352` |
| 본문 | `#324158` |
| 보조·비활성 | `#bbbbbb` |
| 주요 CTA | 흰 필 + 네이비 라벨(어두운 밴드 위) 또는 `#777cdc` 필 + 흰 라벨 |
| 강조 밴드 | `#faeeff`, `#d9e5f5`, `#fdd484` |

**게임 플레이 대시보드** (탭 UI): 심우주 네이비 무대. 2026-09-22 사용자 지시로 Moonlight 팔레트의 진보라 무대·패널(`#402060`/`#605070`)을 걷어내고 우주 공간에 어울리는 네이비로 바꿨다 — DESIGN.md 우선순위(사용자 지시 > 저장소 사실 > DESIGN.md > 레퍼런스)에 따라 이 두 값만 DESIGN.md 팔레트 밖에서 가져온 예외다. 무대 배경은 단색이 아니라 별·성운이 있는 그라데이션 "이미지"(`GamePage.module.css` 의 `background-image`, 청록·파랑 톤만 쓰고 보라 계열은 없음)다.

| 역할 | 값 |
|---|---|
| 무대 배경 | 짙은 네이비 `#0b1224` + 별·성운 그라데이션(청록·파랑, `GamePage.module.css`) |
| 패널·탭 바·카드 | 슬레이트 네이비 `#1c2947` |
| 활성 탭·주요 버튼·선택 하이라이트·배치 가능 칸 | Moonlight Cream `#fff3b7` |
| 에너지 수치·건물 마커·광맥 칸 | Amber `#fdd484` |
| 마법 카드 액센트(스트라이프) | Card Violet `#777cdc`. 보라는 이 용도로만 쓰고 배경에는 쓰지 않는다 |
| 좌석 0 | Bright Blue `#419eff` |
| 좌석 1 | 주황 `#e69f00` |
| 좌석 2 | 청록 `#00c58e` |
| 좌석 3 | 분홍 `#f178b6` |
| 마커(보드 위) | 종류(코어=육각·건물=둥근 사각·유닛=원·마법=마름모)와 무관하게 **좌석 색으로 채운다**. 예전의 흰색 패턴(빗금·점·격자)·테두리 선 모양(dashed·dotted·double) 구분은 좌석색이 생기면서 없앴다 |
| 시야 영역 / 영토 오버레이 | 좌석 색을 낮은 투명도로. 경합 칸은 오버레이 없음. 네 좌석 모두 같은 방식(패턴 없음) |
| 위험·파괴·코어 위협 경고 | **미정** (DESIGN.md에 경고색이 없음) |
| 소행성 칸 | Steel Blue `#36597d` 채움 |
| 텍스트 | `#ffffff`, 보조 `#bbbbbb` |
| 격자선 | Steel Blue `#36597d` (육각 셀을 살짝 축소해 그 틈으로 비친다) |

경고색만 DESIGN.md Unknowns 정책대로 미정으로 남겨 뒀다. 사용자가 정해 주면 이 표를 갱신하고 `client/src/styles/tokens.css` 에 반영한다.

### 구현 방식

- 모든 색·간격·라운드·모션 값은 `client/src/styles/tokens.css` 의 CSS 변수로만 쓴다. 컴포넌트 CSS에 HEX 직접 기입 금지.
- 게임 화면 루트에 `data-world="game"` 을 두고 변수 값을 덮어써서 두 세계를 전환한다.
- 두 세계를 한 화면에 섞지 않는다(DESIGN.md Don't).

### 모바일 우선 (2026-09-22 사용자 지시)

웹 배포지만 화면 구성은 모바일을 기준으로 한다. DESIGN.md의 데스크톱향 본문 15~17px 규정보다 이 지시가 우선한다.

- **폰트**: 기본(`--text-body`) 14px, 그 아래로는 `--text-micro` 12px 밑으로 내려가지 않는다. 보드 마커 라벨·hp·좌석 배지도 12px 이상(`Board.module.css`).
- **줄바꿈**: `body { overflow-wrap: anywhere }` (전역), 닉네임·카드 이름·툴팁이 좁은 폭에서 레이아웃을 깨지 않는다.
- **레이아웃 전환**: `max-width: 720px` 미디어 쿼리로 전환한다. `BoardTab`(보드 위·손패+컨트롤 아래로 스택), `Hand`(세로 목록 → 가로 스크롤), `StatusTab`(표 → 좌석별 카드 목록, `<Cell label>` 컴포넌트가 데스크톱은 `<td>`, 모바일은 `라벨: 값` 줄로 접는다), `GamePage` 헤더(3열 → 세로 스택, 탭 바는 가로 스크롤).
- **보드**: `Board.tsx` 가 컨테이너 가로·세로 모두에 맞춰 육각 크기를 계산하므로(F015 무스크롤) 별도 모바일 분기 없이 좁은 화면에서도 자동으로 맞는다.
- 헤드리스 스크린샷으로 확인할 때 Chrome 헤드리스는 `--window-size` 를 요청해도 뷰포트 폭을 최소 ~504px 로 강제한다. 그보다 좁게 요청하면 실제 레이아웃 폭(504px)이 스크린샷 크롭 폭보다 커져 오른쪽 정렬된 값이 잘려 보이는 착시가 생긴다 — 모바일 확인은 `--window-size` 를 522 이상으로 준다.

## 코딩 규칙

- 룰 엔진(`shared/src/engine`)은 **부수효과 없는 순수 함수**로 작성한다. `(state, action) => newState` 형태. 난수는 상태 안의 시드 RNG만 쓴다. 순회 순서는 Rules.md 13절대로 고정한다(`y` → `x`, Map/Object 키 순서 의존 금지).
- 시야·영토·점수는 파생값이다. 계산 함수가 정본이고, 상태에 캐시하더라도 함수 결과와 반드시 같아야 한다(테스트).
- 카드·맵 수치는 `shared/src/data` 한 곳에만 둔다. 엔진·UI·AI 어디에도 수치를 하드코딩하지 않는다. Rules.md 표와 데이터 파일이 일치하는지 테스트한다.
- 서버와 클라이언트가 같이 쓰는 타입·상수는 반드시 `shared/`에 둔다. 중복 정의 금지.
- Socket 이벤트 이름과 페이로드 타입은 `shared/src/types/events.ts` 한 곳에서 정의한다.
- 클라이언트 탭 컴포넌트는 `React.memo`를 적용하고, 탭 전환으로 언마운트되지 않도록 한다.
- 게임 내 주요 사건(수입 정산, 배치, 전투 결과, 파괴, 탈락, 패스, 턴 전환, 종료)은 모두 `GameState.log`에 기록해 진행 탭에서 보이게 한다(F012).
- 새 기능은 해당 F-ID의 수락 기준을 만족하는지 확인한 뒤 완료로 간주한다. 룰 엔진 변경은 Vitest 테스트를 함께 추가하고 `npm run fixtures` 후 pytest를 돌린다.
- 주석과 UI 문구는 한국어, 식별자는 영어. 카드·맵 id는 Rules.md의 영문 id를 그대로 쓴다.
- Python 코드는 타입 힌트를 필수로 하고, `rules.py`·`search.py` 는 순수 함수로 작성한다. 테스트는 pytest.

## 자주 쓰는 명령

| 목적 | 방법 |
|---|---|
| 서버·클라이언트·AI 백그라운드 실행 (개발) | `/dev` |
| 백그라운드 프로세스 종료 (개발) | `/dev-stop` |
| 테스트 서버 실행 / 종료 (3301, 터널 공개) | `/test-server` · `/test-server-stop` |
| 운영 서버 실행 / 종료 (3201, 터널 공개) | `/prod-server` · `/prod-server-stop` |
| 로그 확인 | `tail -n 50 .dev/server.log`, `.dev/client.log`, `.dev/ai.log` |
| 의존성 설치 (JS) | `npm install` (루트) |
| 의존성 설치 (Python) | `ai\.venv\Scripts\pip install -r ai\requirements.txt` (`/dev`가 venv 없으면 자동 생성) |
| 테스트 (JS) | `npm test` (루트, 전 워크스페이스) |
| 테스트 (Python) | `ai\.venv\Scripts\python -m pytest ai/tests` |
| 공용 픽스처 재생성 | `npm run fixtures` (TS 엔진 출력 → `shared/fixtures/*.json`. 타입·데이터·엔진을 바꾸면 반드시 실행 후 pytest) |
| 타입 검사 | `npx tsc --noEmit -p server` / `-p client` / `-p shared` |
| 플레이어용 규칙 설명서 PDF 재생성 | `python scripts/build-rulebook.py` (reportlab 필요, `pip install reportlab`). Rules.md 를 바꾸면 이 스크립트의 값도 손으로 맞춰 다시 실행한다. 출력: `notes/Rule.pdf` |
| 커밋 & 푸시 | `/commit-push` |

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `spec-checker` | 구현 결과를 `notes/기능명세서`의 F-ID 수락 기준과 `notes/Rules.md`에 대조 |
| `rules-engine-reviewer` | 룰 엔진(시야·배치·전투·점수·턴)의 순수성·결정성·Rules.md 일치·엣지 케이스 검토 |
| `realtime-sync-reviewer` | Socket.io 이벤트, 손패 비공개, 재접속, 상태 브로드캐스트, JSON 스냅샷 복구 검토 |
| `ui-tab-reviewer` | 탭 UI 성능(100ms), 무스크롤 레이아웃, 보드·손패 렌더, 불필요한 리렌더 검토 |
| `ai-reviewer` | Python AI 서비스의 탐색(Minimax/max-n), 평가 함수, 시간 제한, TS 룰 엔진과의 규칙 일치 검토 |

기능 구현을 마치면 `spec-checker`로 수락 기준을 확인하고, 영역에 맞는 리뷰어를 거친 뒤 `/commit-push`한다.
