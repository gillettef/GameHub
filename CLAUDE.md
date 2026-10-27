# 더블 에이전트 — 에이전트의 전쟁 (모바일 웹)

(구 명칭 '스토브리그'. 야구 용어·드라마 제목과 겹쳐 2026-10-15 변경. 공모전 원본 노트의 파일명은 그대로 둔다)

축구 선수 에이전트가 되어 5라운드(라운드마다 1·2차 협상) 동안 구단과 계약을 중개하면서, 시작 때 몰래 받은 목표 카드 2장(예: 공격수 3명 이상 계약 → +10억)을 채우는 카드/보드게임. 수수료 + 달성한 목표 보너스(억 원)가 가장 큰 사람이 이긴다. (v8, 2026-10-27: 비밀 구단·공개 기록·종료 지목을 목표 카드로 교체)
**모바일 웹 전용**. 한 기기 플레이(AI 대전·핫시트)는 브라우저 하나에서 완결되고, 온라인 대전만 같은 Node 서버의 WebSocket 방을 쓴다. **DB 없음** — 방 상태는 서버 메모리, 개인 데이터는 `localStorage`.

- 원본 기획/프로토타입: `notes/stoveleague_README.md`, `notes/stoveleague_source.html` (참고용, 수정하지 않음)
- 규칙·데이터의 단일 기준: `.claude/skills/rules-spec/SKILL.md` — 게임 로직을 건드리기 전에 반드시 읽는다

## 기술 스택
- Vite + TypeScript (strict), 프레임워크 없이 바닐라 DOM
- 테스트: Vitest (규칙 엔진은 반드시 단위 테스트)
- 서버: Node + `ws` (`server/`). esbuild 로 `server-dist/server.cjs` 한 파일에 묶어 EC2에서 의존성 설치 없이 실행. DB 없음, 영속 데이터는 `localStorage`만 사용
- 배포: `vite build` 결과물(`dist/`)을 AWS EC2 공용 서버에서 정적 서빙 (아래 "배포 (AWS)")

## 프로토타입과 달라지는 점
| 프로토타입 | 이 프로젝트 |
|---|---|
| `claude.use("db")` 공유 DB, 초대 코드 온라인 멀티 | **DB 없음**. 한 기기 진행 + 온라인은 서버 메모리의 방(초대 코드) |
| 방장 브라우저가 정산 | 로컬 규칙 엔진(`resolveRound`)이 정산 |
| 계정 ID 중복 검사 | 기기 내 프로필(닉네임)만, 중복 검사 없음 |
| 데스크톱 겸용 레이아웃 | 모바일 세로 화면 전용 |

플레이 모드:
1. **AI 대전** — 사람 1명 + AI 2~3명 (3~4인 전용)
2. **핫시트(돌려하기)** — 한 기기를 돌려가며 사람 2~4명(+AI, 합계 3~4명). 각자 제출 전 "기기 넘기기" 가림 화면을 띄워 다른 사람의 제안을 보지 못하게 한다

3. **온라인 대전** — 각자 자기 휴대폰으로 접속, 사람 1~4명(+AI, 합계 3~4명). 다른 게임(MagicAcademy·Eleven)과 같은 방식:
   - 방장이 방을 만들면 4자리 초대 코드(+ `?room=CODE` 초대 링크). 계정 없음, 닉네임은 기기 프로필
   - **서버가 정산**(`server/hub.ts`가 `src/core`를 그대로 호출). 각자에게는 `redact`로 다른 사람 목표 카드·다음 라운드 이후 이벤트·rng 를 가려 보낸다(종료 후 전부 공개). 제출 현황은 누가 냈는지만 공개
   - 재접속: 서버가 준 비밀 토큰을 `localStorage`(`sl:v1:online`)에 두고 끊기면 자동 `rejoin`. 게임 중 끊겨도 자리는 유지되고 제출을 기다린다(결과 화면의 "다음"은 접속 중인 사람만 기다림). 방장은 게임 중 사람 자리를 AI로 교체할 수 있다
   - 게임 중 나가기/내보내기 → 그 자리는 AI(보통·balanced)가 이어받고 복귀 불가. 방장이 30초 끊기면 접속 중인 사람에게 이양, 대기실에서 45초 끊기면 방에서 빠짐, 전원이 30분 끊기면 방 삭제
   - 서버 재시작(배포) 시 진행 중인 방은 사라진다

규칙 엔진은 입출력이 직렬화 가능한 순수 함수로 유지한다 (온라인 서버가 그대로 쓴다).

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
    game.ts    # createGame / dealRound / nextRound / finishGame(목표 카드 공개·정산)
  online/      # protocol.ts(클라·서버 공용 메시지 타입), client.ts(WebSocket 연결·자동 재접속)
  store/       # localStorage 래퍼(프로필·전적·진행 중 게임·온라인 재접속 토큰), 버전 키 포함
  ui/
    screens/   # home, setup, handoff, bid, result, final(목표 카드 공개), rules
    components/
    styles/    # CSS 변수·모바일 레이아웃
  main.ts
server/        # index.ts(정적 dist + WebSocket /ws + /health, 한 포트), hub.ts(방·자리·정산·가림, 전송 계층과 무관 → hub.test.ts)
tests/         # 또는 *.test.ts 를 src/core 옆에 배치
```

## 명령어
```
npm install
npm run dev        # 개발 서버 (포트 5180 고정, 모바일 확인은 --host 로 같은 Wi-Fi 기기에서 접속). /ws 는 8091 로 프록시
npm run server     # 온라인 대전 서버 (tsx watch, 8091). 온라인 대전을 개발할 때 dev 와 함께 띄운다
npm start          # 빌드 결과로 서버 실행 (scripts/aws/serve.mjs, EC2 와 같은 진입점)
npm run share      # 빌드 후 Cloudflare 퀵 터널로 임시 공개 주소(+QR) 발급 → 다른 네트워크(LTE 등)에서 접속. 종료하면 주소 소멸
npm run build      # tsc --noEmit + vite build + 서버 번들(server-dist/server.cjs)
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
- 다른 게임(Eleven·MagicAcademy·Rootbound·SmilePark)과 같은 EC2(t4g.nano, 서울) 1대를 공유한다. `main`에 push하면 `.github/workflows/deploy-aws.yml`이 `npm test` → `npm run build`를 통과했을 때만 `dist`·`server-dist`(ws 까지 묶은 서버 번들)·`scripts/aws/`(systemd 진입점 `serve.mjs` 등)를 `~/doubleagent`에 올리고, 서버에서 `scripts/aws/deploy-remote.sh`가 systemd `doubleagent`(포트 **8091**)를 재시작·헬스체크(`/health`)한다. 정적 파일과 온라인 대전 WebSocket(`/ws`)을 같은 포트로 서빙한다. 접속은 `http://54.116.67.196:8091`.
- **수동 배포**(push 없이 재배포): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1` — 로컬에서 테스트·빌드 후 같은 방식으로 전송한다. SSH 키·IP는 Rootbound와 공용인 `.dev/astraltab-key.pem`, `.dev/aws-public-ip.txt`(git 제외)를 쓰고, 없으면 `../Rootbound/.dev/`의 것을 쓴다.
- 서버 로그: `ssh -i ../Rootbound/.dev/astraltab-key.pem ec2-user@54.116.67.196 "sudo journalctl -u doubleagent -n 100"`
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
  - `dev` / `dev-stop` — 로컬 개발 서버(vite 5180 + 온라인 서버 8091) 백그라운드 실행 / 종료 (`scripts/dev-stop.ps1`)
