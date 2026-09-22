# AstralTab

웹 브라우저에서 친구와 즐기는 텍스트·카드 기반 우주 RTS 전략 보드게임 플랫폼.
보드 / 상태 / 진행 세 개의 탭으로 화면을 나누고, 스크롤 없이 한 화면에서 대국을 진행한다.

기획 문서는 `notes/`에 있다. 기능을 구현하기 전에 반드시 해당 F-ID의 수락 기준을 확인한다.

| 문서 | 내용 |
|---|---|
| `notes/PRD_AstralTab_*.md` | 제품 목표, 타겟, 시나리오, KPI, 리스크 |
| `notes/기능명세서_AstralTab_*.md` | F001~F029 기능 ID, 설명, 수락 기준, 중요도 |
| `notes/구현방법_AstralTab_*.md` | 실시간 동기화, 탭 전환 성능, 전투 판정 구현 접근 |
| `notes/추진로드맵_AstralTab_*.md` | Phase 1~3 범위 |
| `notes/유저플로우_AstralTab_*.md` | 유저 플로우 다이어그램 (base64 PNG 1장, 본문 없음) |

---

## 필수 작업 규칙

1. **작업이 완료되면 반드시 `git commit` & `git push`를 진행한다.** 기능 하나, 버그 수정 하나 등 의미 있는 단위가 끝날 때마다 커밋하고 푸시한다. `/commit-push` 스킬을 사용한다.
2. **commit 메시지는 가급적 한국어로 작성한다.** 제목은 `<타입>: <요약>` 형식 (예: `기능: 로비 초대 링크 생성 (F001)`, `수정: 턴 종료 시 자원 이중 가산 버그`). 관련 F-ID가 있으면 괄호로 덧붙인다.
3. **push 대상 repo는 `https://github.com/gillettef/AstralTab.git` 이다.** 브랜치는 `main`을 기본으로 사용한다.
4. **이 서비스는 DB를 사용하지 않는다.** notes/ 문서에 "데이터베이스", "Redis", "세션 스냅샷 저장" 등이 언급되어 있어도 DB·Redis·ORM을 도입하지 않는다. 자세한 내용은 아래 "DB 없는 상태 관리" 참고.
5. 로컬 테스트 시 서버를 포그라운드로 직접 띄우지 않는다(터미널이 블로킹됨). 반드시 `/dev`로 시작하고 `/dev-stop`으로 종료한다.

---

## 기술 스택 (확정)

notes/의 추천 스택을 기반으로 하되, DB 없음·단일 언어 원칙에 맞춰 아래로 확정한다.

| 영역 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript (전 영역) | 서버·클라이언트·공용 타입 모두 TS |
| 백엔드 | Node.js 22 + Express + Socket.io | 포트 `3001` |
| 프론트엔드 | React 18 + Vite + Zustand | 포트 `5173`, `/api`·`/socket.io`는 Vite proxy로 3001에 연결 |
| 스타일 | CSS Modules | 탭 전환 시 언마운트 대신 `display:none`/`visibility` 전환 |
| 테스트 | Vitest | 룰 엔진은 순수 함수로 작성하고 단위 테스트 필수 |
| AI | Node.js 내 Minimax (TS) | notes/의 Python 추천 대신 단일 언어(TS)로 통일. 별도 Python 프로세스·HTTP 브리지 없이 서버 게임 루프에서 직접 호출하기 위함. (Python 3.11.7은 PC에 설치돼 있으나 셸 PATH에 실행 파일 폴더가 없음: `C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe`) |
| 저장소 | **없음** | 인메모리 + JSON 파일 스냅샷 |
| 패키지 관리 | npm workspaces | `npm install`은 루트에서 한 번 |

## 디렉터리 구조 (목표)

```
AstralTab/
├── CLAUDE.md
├── package.json          # npm workspaces: server, client, shared
├── notes/                # 기획 문서 (수정하지 않음)
├── scripts/              # dev.ps1, dev-stop.ps1
├── shared/               # 서버·클라이언트 공용 타입, 카드/유닛 스펙 상수, 룰 엔진
│   └── src/
│       ├── types/        # GameState, Player, Unit, Building, Card, Action ...
│       ├── data/         # 카드·유닛·건물 기준표 (자원/마나 생산 계수, 공격/방어/체력)
│       └── engine/       # 순수 함수 룰 엔진 (자원 정산, 배치 검증, 전투, 승리 판정)
├── server/
│   └── src/
│       ├── index.ts      # Express + Socket.io 부트스트랩
│       ├── rooms/        # 방 생성, 초대 링크, 비밀번호, 로비
│       ├── game/         # 룸별 게임 루프, 액션 처리 → engine 호출 → 브로드캐스트
│       ├── ai/           # Minimax AI 플레이어
│       └── persistence/  # JSON 파일 스냅샷 저장/복구 (DB 아님)
└── client/
    └── src/
        ├── pages/        # Lobby, DeckBuilder, Game, Result
        ├── tabs/         # BoardTab, StatusTab, ProgressTab
        ├── store/        # Zustand 전역 상태 (모든 탭 데이터 선로드)
        └── socket/       # Socket.io 클라이언트, 재연결 처리
```

디렉터리가 아직 없다면 위 구조로 생성한다. 구조를 바꿀 경우 이 문서도 함께 갱신한다.

---

## DB 없는 상태 관리

- **단일 진실 공급원은 서버 메모리**의 `Map<roomId, GameState>` 이다.
- 클라이언트는 절대 게임 상태를 직접 계산하지 않는다. 액션을 보내고 서버가 브로드캐스트한 전체 상태로 덮어쓴다.
- **자동 저장(F006)·복구(F007)** 는 `server/data/rooms/<roomId>.json` 에 턴 종료 시점마다 `GameState`를 통째로 직렬화하여 구현한다. 서버 재시작 시 이 디렉터리를 읽어 메모리에 복원한다.
- **비동기 턴 모드(F005)** 도 같은 JSON 스냅샷으로 유지한다. 별도 큐·DB 없음.
- **로그인/회원가입은 없다.** 유저플로우의 "로그인" 단계는 닉네임 입력으로 대체한다. 닉네임과 재접속용 `playerToken`은 브라우저 `localStorage`에 보관하고, 서버는 `roomId + playerToken` 으로 재접속 플레이어를 식별한다.
- `server/data/` 는 git에 커밋하지 않는다(`.gitignore`).

---

## 게임 규칙 요약 (notes/ 기준)

- **맵**: 격자형 우주 전장. 게임 시작 시 메인 기지가 대칭 위치에 자동 배치된다(F018).
- **자원 / 마나**: 턴 시작 시 보유 건물의 생산 계수를 합산해 자동 가산(F020). 건물이 파괴되면 즉시 생산량이 차감된다(F021). 초기값은 기준표로 자동 세팅(F019).
- **카드**: 특수 건물 / 유닛 / 마법 세 종류. 게임 전 덱 빌딩에서 선택(F016, F017).
- **유닛 배치**: 자원·마나 요구치 검증 후 배치, 부족 시 거부(F022).
- **전투**: 같은 셀에서 조우 시 공격력·방어력·체력 스펙으로 서버가 자동 판정(F023). 순수 함수로 구현하고 다중 유닛 교전 시 정산 순서를 결정적으로 고정한다.
- **승리**: 상대 메인 기지 파괴 시 즉시 승리(F024). 덱 소진 또는 제한 턴 도달 시 영토 점수 + 건물 점수 합산으로 승자 결정(F025).
- **탭 UI**: 보드(F008, F009) / 상태(F010, F011) / 진행·로그(F012, F013). 탭 전환 100ms 이내(F014), 데스크톱 해상도에서 수직 스크롤 없음(F015).
- **멀티플레이**: 초대 링크(F001), 로비(F002), 4자리 비밀번호(F003), Socket.io 실시간 동기화 0.5초 이내(F004).
- **AI 대전**: 싱글 플레이 방(F026), Minimax 기반 행동 결정 2초 이내(F027), 자원 우선 → 상위 유닛 소환(F028), 거리 기반 공격/방어 전환(F029).

## 로드맵 순서

1. **Phase 1**: 로비·초대, 탭 UI 레이아웃, 덱 빌딩, 기지·자원 초기 세팅 (F001~F003, F008~F019)
2. **Phase 2**: Socket.io 실시간 동기화, 비동기 턴, 자원·전투·승리 룰 엔진 (F004, F005, F020~F025)
3. **Phase 3**: JSON 스냅샷 자동 저장·복구, AI 대전 (F006, F007, F026~F029)

---

## 코딩 규칙

- 룰 엔진(`shared/src/engine`)은 **부수효과 없는 순수 함수**로 작성한다. `(state, action) => newState` 형태. `Math.random`이 필요하면 시드 기반 RNG를 상태에 넣어 재현 가능하게 한다.
- 서버와 클라이언트가 같이 쓰는 타입·상수는 반드시 `shared/`에 둔다. 중복 정의 금지.
- Socket 이벤트 이름과 페이로드 타입은 `shared/src/types/events.ts` 한 곳에서 정의한다.
- 클라이언트 탭 컴포넌트는 `React.memo`를 적용하고, 탭 전환으로 언마운트되지 않도록 한다.
- 게임 내 주요 사건(자원 정산, 전투 결과, 파괴, 턴 전환)은 모두 `GameState.log`에 기록해 진행 탭에서 보이게 한다(F012, F020).
- 새 기능은 해당 F-ID의 수락 기준을 만족하는지 확인한 뒤 완료로 간주한다. 룰 엔진 변경은 Vitest 테스트를 함께 추가한다.
- 주석과 UI 문구는 한국어, 식별자는 영어.

## 자주 쓰는 명령

| 목적 | 방법 |
|---|---|
| 서버·클라이언트 백그라운드 실행 | `/dev` |
| 백그라운드 서버 종료 | `/dev-stop` |
| 로그 확인 | `tail -n 50 .dev/server.log`, `tail -n 50 .dev/client.log` |
| 의존성 설치 | `npm install` (루트) |
| 테스트 | `npm test` (루트, 전 워크스페이스) |
| 타입 검사 | `npx tsc --noEmit -p server` / `-p client` / `-p shared` |
| 커밋 & 푸시 | `/commit-push` |

## 서브에이전트

| 에이전트 | 용도 |
|---|---|
| `spec-checker` | 구현 결과를 `notes/기능명세서`의 F-ID 수락 기준과 대조 |
| `rules-engine-reviewer` | 룰 엔진(자원·전투·승리 판정)의 순수성·결정성·엣지 케이스 검토 |
| `realtime-sync-reviewer` | Socket.io 이벤트, 재접속, 상태 브로드캐스트, JSON 스냅샷 복구 검토 |
| `ui-tab-reviewer` | 탭 UI 성능(100ms), 무스크롤 레이아웃, 불필요한 리렌더 검토 |

기능 구현을 마치면 `spec-checker`로 수락 기준을 확인하고, 영역에 맞는 리뷰어를 거친 뒤 `/commit-push`한다.
