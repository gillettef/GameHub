# 더블 에이전트 — 에이전트의 전쟁 (모바일 웹)

(구 명칭 '스토브리그'. 야구 용어·드라마 제목과 겹쳐 2026-10-15 변경. 공모전 원본 노트의 파일명은 그대로 둔다)

축구 선수 에이전트가 되어 5라운드(라운드마다 1·2차 협상) 동안 구단과 계약을 중개하면서, 몰래 한 구단의 이중 첩자로서 그 구단에 선수를 몰아 주는 카드/보드게임. 수수료 + 들키지 않은 비밀 구단 보너스 + 지목 보너스(억 원)가 가장 큰 사람이 이긴다.
**모바일 웹 전용**, **서버·DB 없이** 브라우저 하나에서 완결되는 정적 웹앱으로 만든다.

- 원본 기획/프로토타입: `notes/stoveleague_README.md`, `notes/stoveleague_source.html` (참고용, 수정하지 않음)
- 규칙·데이터의 단일 기준: `.claude/skills/rules-spec/SKILL.md` — 게임 로직을 건드리기 전에 반드시 읽는다

## 기술 스택
- Vite + TypeScript (strict), 프레임워크 없이 바닐라 DOM
- 테스트: Vitest (규칙 엔진은 반드시 단위 테스트)
- 백엔드 없음. 영속 데이터는 `localStorage`만 사용
- 배포: `vite build` 결과물(`dist/`)을 AWS EC2 공용 서버에서 정적 서빙 (아래 "배포 (AWS)")

## 프로토타입과 달라지는 점
| 프로토타입 | 이 프로젝트 |
|---|---|
| `claude.use("db")` 공유 DB, 초대 코드 온라인 멀티 | **DB 없음**. 한 기기에서 진행 |
| 방장 브라우저가 정산 | 로컬 규칙 엔진(`resolveRound`)이 정산 |
| 계정 ID 중복 검사 | 기기 내 프로필(닉네임)만, 중복 검사 없음 |
| 데스크톱 겸용 레이아웃 | 모바일 세로 화면 전용 |

플레이 모드:
1. **AI 대전** — 사람 1명 + AI 2~3명 (3~4인 전용)
2. **핫시트(돌려하기)** — 한 기기를 돌려가며 사람 2~4명(+AI, 합계 3~4명). 각자 제출 전 "기기 넘기기" 가림 화면을 띄워 다른 사람의 제안을 보지 못하게 한다

온라인 멀티는 범위 밖. 단, 나중에 붙일 수 있도록 규칙 엔진은 입출력이 직렬화 가능한 순수 함수로 유지한다.

## 디렉터리 구조 (목표)
```
src/
  core/        # 순수 게임 로직 — DOM·localStorage·Math.random 직접 사용 금지
    types.ts   # GameState, Offer, Player, Club, Event 타입
    data.ts    # 선수/구단/이벤트 정적 데이터
    rng.ts     # 시드 기반 난수 (mulberry32 등)
    rules.ts   # evaluateOffer(매력도·수수료 계산), 유효성 검사
    resolve.ts # resolveRound: 경쟁 판정·점수 반영·로그 생성
    ai.ts      # AI 에이전트 제안 생성
    game.ts    # createGame / dealRound / nextRound / finishGame(비밀 구단 지목)
  store/       # localStorage 래퍼(프로필·전적·진행 중 게임 저장), 버전 키 포함
  ui/
    screens/   # home, setup, handoff, bid, result, guess, final, rules
    components/
    styles/    # CSS 변수·모바일 레이아웃
  main.ts
tests/         # 또는 *.test.ts 를 src/core 옆에 배치
```

## 명령어
```
npm install
npm run dev        # 개발 서버 (모바일 확인은 --host 로 같은 Wi-Fi 기기에서 접속)
npm run share      # 빌드 후 Cloudflare 퀵 터널로 임시 공개 주소(+QR) 발급 → 다른 네트워크(LTE 등)에서 접속. 종료하면 주소 소멸
npm run build      # tsc --noEmit + vite build
npm run test       # vitest run
npm run typecheck  # tsc --noEmit
```
(초기 스캐폴딩 시 위 스크립트를 package.json에 그대로 정의한다.)

## 코딩 규칙
- `src/core`는 순수 함수만. 난수는 반드시 `rng` 인자로 주입 → 시드로 재현 가능한 테스트/시뮬레이션
- 게임 상태는 불변 업데이트(새 객체 반환). UI는 상태 → 화면 렌더링만 담당
- 금액은 억 단위 `number`, 계산 후 표시할 때만 `Math.round(x*100)/100` 처리. 누적 오차를 피하기 위해 내부 저장값도 정산 시점에 소수 둘째 자리로 반올림
- 사용자 입력(닉네임 등)을 `innerHTML`에 넣을 때는 반드시 이스케이프. 가능하면 `textContent` 사용
- `localStorage` 접근은 `store/`에서만, try/catch로 감싸고 실패해도 게임은 진행 가능해야 함. 스키마 바뀌면 키 버전(`sl:v1:*`)을 올린다
- UI 문구는 한국어
- 테마는 축구 (아이콘 ⚽, 포지션 FW/MF/DF/GK). 프로토타입의 ⚾ 등 야구 요소는 가져오지 않는다

## 모바일 전용 UI 원칙
- 기준 뷰포트 360×640 ~ 430×932 세로. 가로 스크롤 금지
- 터치 타깃 최소 44×44px, hover에 의존하는 정보 금지
- `viewport-fit=cover` + `env(safe-area-inset-*)`로 노치/홈바 대응. 높이는 `100dvh`
- 주요 액션(제출/다음)은 엄지가 닿는 하단 고정 바에 배치
- 데스크톱에서 열면 모바일 폭(최대 480px) 중앙 정렬로 표시 (별도 데스크톱 레이아웃 만들지 않음)
- 핀치 줌으로 인한 레이아웃 깨짐, 더블탭 확대(`touch-action: manipulation`) 방지
- 다크 테마 기본 (프로토타입 색상 토큰 계승: `--bg #0b1220`, `--gd #f5c86b`, `--gr #68d6b0`)

## 작업 흐름
- 세션 내 대화는 가급적 한국어로 한다
- 규칙 변경 시: `rules-spec` 스킬 문서를 먼저 고치고 → 엔진/테스트 → UI 순서로 반영
- 로직 변경 후 `npm run test`, UI 변경 후 `/mobile-check` 스킬로 확인
- 밸런스 수치 조정은 `balance-analyst` 에이전트로 시뮬레이션 근거를 남긴 뒤 진행

## 배포 (AWS)
- 다른 게임(Eleven·MagicAcademy·Rootbound·SmilePark)과 같은 EC2(t4g.nano, 서울) 1대를 공유한다. `main`에 push하면 `.github/workflows/deploy-aws.yml`이 `npm test` → `npm run build`를 통과했을 때만 `dist`와 `scripts/aws/serve.mjs`(의존성 없는 정적 서버)를 `~/doubleagent`에 올리고 systemd `doubleagent`(포트 **8091**)를 재시작한다. 접속은 `http://54.116.67.196:8091`.
- SSH(22)는 관리자 IP만 열려 있어 워크플로가 러너 IP를 임시로 열었다 닫는다. 저장소 시크릿: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_SECURITY_GROUP_ID / EC2_HOST / EC2_HOST_KEY / EC2_SSH_PRIVATE_KEY (다른 게임 저장소와 같은 값).
- 서버 준비(완료, 2026-10-17): `scripts/aws/provision.sh` → `scripts/aws/units.sh`, 보안 그룹 TCP 8091 인바운드 추가.

## Git
- 저장소: https://github.com/gillettef/DoubleAgent.git (`origin`, 기본 브랜치 `main`)
- 모든 작업이 끝나면 git commit 후 push까지 진행한다
- 커밋 메시지는 가급적 한국어로 작성한다 (예: `규칙 엔진: 빅딜 시즌 동률 보너스 처리`)
- 커밋 전 `npm run typecheck && npm run test`가 통과해야 한다 (스크립트가 생긴 뒤부터)

## .claude 구성
- 에이전트 (`.claude/agents/`)
  - `rules-engine` — `src/core` 규칙 엔진 구현·테스트 담당
  - `mobile-ui-reviewer` — 모바일 UX/접근성/레이아웃 리뷰 (읽기 전용)
  - `balance-analyst` — AI 대 AI 시뮬레이션으로 밸런스 분석
- 스킬 (`.claude/skills/`)
  - `rules-spec` — 규칙·데이터 단일 기준 문서
  - `mobile-check` — 타입체크·테스트·빌드 + 모바일 체크리스트 검증
  - `simulate` — 시드 고정 시뮬레이션 실행 및 리포트
