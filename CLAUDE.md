# Neoterra (네오테라) — 새 행성 개척 문명 카드게임 (모바일 웹)

지구를 떠난 개척 선단이 낯선 행성에 정착해 3개 고리(시대) 동안 문명을 키우는 **카드 기반 문명 건설 게임**. 지도 없이 개인 보드의 **방사형 테크 웹**을 넓히고, 공용 **카드 줄**에서 건물·유닛·불가사의를 경쟁해서 가져오며, 세 갈래 **노선**(방주·공생·합성) 중 하나로 문명의 정체성을 굳힌다. 노선별 승리 트랙을 먼저 완주하거나, 3고리가 끝날 때 문화 점수가 가장 높은 사람이 이긴다.

- 2026-10-30 기획 시작.
- **영감의 출처**: 문명 보드게임 *쓰루 디 에이지스*와 PC 게임 *시드마이어의 문명 5*, *시드마이어의 문명: 비욘드 어스*에서 장르적 영감을 받았다.
- **명칭·카드·구성**: *시드마이어의 문명: 비욘드 어스*를 참고하여 **재설계**했다. 원작의 명칭·카드·수치를 그대로 옮기지 않고 네오테라 용어와 자체 설계로 바꾼다(아래 "오리지널 원칙").
- **모바일 웹 전용**. 한 기기 플레이(AI 대전·핫시트)는 브라우저 하나에서 완결되고, 온라인 대전만 같은 Node 서버의 WebSocket 방을 쓴다. **DB 없음**.

**게임 규칙의 정본은 `notes/Rules.md` 다.** 엔진·AI·UI 어디든 규칙이 어긋나면 Rules.md가 맞다. 규칙을 바꿀 때는 Rules.md를 먼저 고친다. 지금은 **v0 초안**이라 수치 대부분이 "미정"이며, 시뮬레이터로 재면서 확정한다.

| 문서 | 내용 |
|---|---|
| `notes/Rules.md` | **규칙 정본**(v0 초안). 구성 요소, 테크 웹, 노선, 차례 흐름, 자원, 카드 줄, 토착 생물·궤도·임무·헌장, 승리·점수, 용어표 |
| `notes/Design.md` | (작성 예정) 기획 의도·대안 비교·결정 기록. **규칙 아님** |

---

## 필수 작업 규칙

1. **Claude Code는 사용자에게 보이는 답변을 한국어로 작성한다.** 코드 식별자는 영어, 주석·UI 문구·문서는 한국어.
2. **작업 단위가 끝나면 `git commit` & `git push`** 한다(`/commit-push`). 커밋 메시지는 한국어, 제목은 `<타입>: <요약>`(예: `기능: 테크 웹 연구 검증`, `수정: 인접 할인 계산`). 테스트·빌드가 통과하는 완결된 단위에서만 커밋한다.
3. **push 대상 repo: `https://github.com/gillettef/Neoterra.git`**. **일상 작업은 `dev` 브랜치에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. 상세는 `docs/environments.md`.
   - 이 저장소의 GitHub 계정은 **`gillettef`만** 쓴다. 로컬 git 설정 `credential.https://github.com.username=gillettef` 로 고정돼 있으니 지우거나 다른 계정으로 바꾸지 않는다.
4. **DB를 쓰지 않는다.** DB·Redis·ORM 도입 금지. 방 상태는 서버 메모리, 개인 데이터는 `localStorage`.
5. 개발 서버를 포그라운드로 띄우지 않는다. `/dev` 로 시작하고 `/dev-stop` 으로 끈다.
6. **포트**: Neoterra 는 dev Vite **5190**, 서버 **8094**(dev·운영 공통). 다른 프로젝트 포트(3001·3002 Eleven, 3101·3201 Rootbound, 5173, 5180, 8000·8001, 8080 MagicAcademy, 8090 SmilePark, 8091 DoubleAgent, 8092 Tesseract, 8093 Beltbreaker)를 점유한 프로세스는 절대 종료하지 않는다.
7. **규칙 변경 순서**: `notes/Rules.md` → `src/core/data` + `src/core/engine` + 테스트 → UI. 수치를 바꿀 때는 먼저 `/simulate` 로 전후를 재고, 결정 이유를 Rules.md "밸런스 기록" 절에 남긴다.
8. 새 라이브러리 도입 전에는 사용자에게 먼저 확인한다.

## 오리지널 원칙

- 다른 게임의 고유 명칭(게임명, 성향·세력·후원사·승리 조건 이름, 카드 이름)과 아트·문구를 쓰지 않는다. 장르 공통 개념(기술 연구, 불가사의, 시대, 행복도류 자원)은 써도 되지만 **이름은 Rules.md "용어표"의 네오테라 용어**를 쓴다.
- 카드 효과·수치·구성은 직접 설계한다. 기존 게임의 카드 목록을 옮겨 적지 않는다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript (strict) | 엔진·서버·클라이언트 공용 |
| 프론트엔드 | React 18 + Vite | 포트 5190, `/ws` 는 Vite proxy로 8094 |
| 상태 | Zustand | UI 상태만. 게임 상태의 권위는 엔진(로컬) 또는 서버(온라인) |
| 스타일 | CSS Modules + `tokens.css` CSS 변수 | 컴포넌트 CSS 에 HEX 직접 기입 금지 |
| 테크 웹 렌더 | SVG | 노드·연결선, viewBox 로 화면 폭에 맞춤, 핀치 줌 대신 확대 모달 |
| 서버 | Node 22 + `ws` | `server/`. esbuild 로 `server-dist/server.cjs` 한 파일 번들 |
| 테스트 | Vitest | 엔진은 단위 테스트 필수 |
| 배포 | AWS EC2 공용 서버(t4g.nano, 서울), 포트 8094 | 다른 게임과 같은 방식(아래 "배포") |

## 디렉터리 구조 (목표)

```
Neoterra/
├── CLAUDE.md
├── notes/Rules.md          # 규칙 정본
├── scripts/                # dev.ps1, dev-stop.ps1, simulate.ts, deploy-aws.ps1, aws/(serve.mjs, deploy-remote.sh)
├── src/
│   ├── core/               # 순수 게임 로직 — DOM·localStorage·Math.random·Date 금지
│   │   ├── types.ts        # GameState, PlayerState, TechNode, Card, Action
│   │   ├── data/           # constants.ts, techWeb.ts(노드·연결), cards.ts(카드 줄 덱), doctrines.ts(노선), fleets.ts(선단)
│   │   ├── engine/         # setup, research(테크 웹), actions, production, natives(토착 생물), orbit, victory, turn
│   │   ├── rng.ts          # 시드 RNG (mulberry32)
│   │   ├── ai.ts           # AI 결정
│   │   └── mask.ts         # 비공개 정보 가림(임무 카드·덱 순서·시드)
│   ├── online/             # protocol.ts(클라·서버 공용 메시지), client.ts(재접속)
│   ├── store/              # localStorage 래퍼(키 접두어 `nt:v1:`), Zustand
│   └── ui/                 # pages/, tabs/, components/(TechWeb, CardRow, ColonyBoard …), styles/
├── server/                 # index.ts(정적 dist + /ws + /health), hub.ts(방·자리·정산·가림)
└── tests/ 또는 *.test.ts
```

## 명령어 (스캐폴딩 시 package.json 에 이대로 정의)

```
npm install
npm run dev        # Vite 5190 (--host)
npm run server     # 온라인 서버 tsx watch 8094
npm run build      # tsc --noEmit + vite build + 서버 번들
npm test           # vitest run
npm run typecheck
npx tsx scripts/simulate.ts --games 500 --players 3 --seed 1
```

## 코딩 규칙

- `src/core` 는 **순수 함수**: `(state, action) => { state, error? }`. 입력을 변이하지 않는다. 난수는 상태 안의 시드 RNG만.
- 연구 가능 노드·비용·생산량·노선 단계·점수는 **파생값**이다. 계산 함수가 정본이고 상태에 캐시하지 않는다.
- 수치·카드·노드 정의는 `src/core/data` 한 곳에만. 엔진·UI·AI에 하드코딩 금지.
- 클라이언트·서버 공용 메시지 타입은 `src/online/protocol.ts` 한 곳.
- 주요 사건(연구, 카드 획득, 건설, 노선 단계 도달, 토착 생물 공격, 위성 발사·추락, 승리 트랙 진행, 종료)은 `GameState.log` 에 남긴다.
- 사용자 입력은 `textContent` 로 넣는다. `innerHTML` 금지.
- `localStorage` 접근은 `src/store` 에서만, try/catch, 키 버전 `nt:v1:*`.

## 플레이 모드

1. **AI 대전**: 사람 1 + AI 1~3 (2~4인)
2. **핫시트**: 한 기기를 돌려 쓰며, 차례마다 "기기 넘기기" 가림 화면
3. **온라인 대전**: 방장이 방을 만들면 4자리 초대 코드(`?room=CODE`). 계정 없음. **서버가 엔진을 그대로 호출해 정산**하고, 각자에게 `mask` 로 다른 사람의 임무 카드·덱 순서·시드를 가려 보낸다. 재접속 토큰은 `localStorage`. 게임 중 나간 자리는 AI가 이어받는다. 서버 재시작 시 진행 중인 방은 사라진다.

## 모바일 UI 원칙

- 기준 뷰포트 360×640 ~ 430×932 세로, 데스크톱은 최대 480px 가운데 정렬. 가로 스크롤 금지.
- 터치 타깃 44×44px 이상, hover 의존 금지, `touch-action: manipulation`, `100dvh` + `env(safe-area-inset-*)`.
- 기본 글자 14px, 최소 12px. 다크 테마 기본(행성 밤하늘 계열, 토큰은 스캐폴딩 때 정한다).
- 화면은 탭으로 나눈다(안 확정 전 후보: **식민지**(자원·건물·정착민) / **테크 웹** / **카드 줄** / **현황**(노선·승리 트랙·상대) / **설명**). 주요 행동 버튼은 하단 고정 바.
- 테크 웹은 작은 화면에서 한눈에 보이도록 고리별 색·노선 아이콘을 쓰고, 노드를 누르면 상세 시트를 연다.

## 배포 (AWS) — 준비 전

- 다른 게임과 같은 EC2(t4g.nano, 서울) 1대를 공유한다. systemd `neoterra`, 포트 8094, 경로 `~/neoterra`. `main` 병합 시 `.github/workflows/deploy-aws.yml` 이 `npm test` → `npm run build` 통과 후 배포(DoubleAgent 구성을 본뜬다).
- SSH 키·IP는 `../Rootbound/.dev/astraltab-key.pem`, `../Rootbound/.dev/aws-public-ip.txt` 를 공용으로 쓴다. 보안 그룹에 TCP 8094 인바운드 추가가 필요하다(사용자 확인 후).

## .claude 구성

| 종류 | 이름 | 용도 |
|---|---|---|
| 에이전트 | `rules-engine-reviewer` | `src/core` 순수성·결정성·Rules.md 일치·테크 웹 그래프 엣지 케이스 검토 (읽기 전용) |
| 에이전트 | `balance-analyst` | AI 대 AI 시뮬레이션으로 노선·선단·자리별 승률, 테크 웹 경로 다양성 분석 |
| 에이전트 | `mobile-ui-reviewer` | 모바일 레이아웃·터치·테크 웹 가독성·탭 성능 검토 (읽기 전용) |
| 에이전트 | `online-sync-reviewer` | WebSocket 프로토콜·비공개 정보 가림·재접속·서버 권위 검토 (읽기 전용) |
| 스킬 | `/dev`, `/dev-stop` | Vite 5190 + 서버 8094 백그라운드 실행 / 종료 |
| 스킬 | `/commit-push` | 한국어 커밋 후 push |
| 스킬 | `/simulate` | 시드 고정 대량 시뮬레이션과 밸런스 리포트 |
| 스킬 | `/mobile-check` | 타입체크·테스트·빌드 + 모바일 체크리스트 |

기능을 구현하면 영역에 맞는 리뷰어를 거친 뒤 `/commit-push` 한다.
