# SmilePark (놀이공원 보드게임)

놀이공원을 경영해 가장 높은 만족도(VP)를 얻는 2~5인 경영 보드게임의 기획·규칙·카드 데이터를 관리하는 프로젝트.

## 다음 작업 최우선 과제 (규칙 v1 도입 후 남은 문제, 2026-10-07)
새 세션을 시작하면 사용자가 다른 일을 지시하지 않는 한 **이 목록부터** 처리한다. 해결한 항목은 이 목록에서 지우고 `docs/balance-report.md` "남은 과제"도 같이 갱신한다. 모든 조정은 `docs/design-v1.md` 0절의 오프라인 원칙(카드 인쇄값 그대로, 손계산, 확률·환산 공식 금지)을 지킨다. 수치는 `npx tsx scripts/balance.ts --n 1500`과 `npm run sim`으로 전후를 비교한다.

1. **사용자 확정 받기**: `docs/design-v1.md` 13절의 임시 수치·관객 그룹 28장 구성·특수효과 재해석은 모두 임시값이다. 작업 시작 시 사용자에게 확정 여부를 먼저 묻는다.
2. **점수 규모가 큼**: 한 게임 만족도가 약 150~170점이라 오프라인에서 1/5 토큰으로 세기 불편하다. 두 방법 중 사용자와 정한다. ① 수치 축소(1명당 만족도 1~2 등) ② 점수 트랙(0~100, 2바퀴)이나 10점 토큰 도입.
3. **후반 잔액 과다**: 최종 잔액이 $25~30 남는다(만족도 +5~6). 돈을 쓸 곳이 사실상 입찰뿐이고 AI 입찰이 소극적이다(`AI_PROFILES`의 `bidRate`·`bidMax`). AI 입찰 개선과 경제 조정(입장료 상한, 상점 수익, 후반 지출처)을 검토한다.
4. **연구원 약함**: 고용 판당 0.3명, 고용자 승률 15%(현재 효과: 매 라운드 만족도 +1, `CFG.researchSat`). +2로 올리면 1라운드 선 플레이어 쏠림이 생겼으니 다른 효과도 함께 검토한다.
5. **약한/강한 카드 조정**(3인 거울전 구매자 승률, 기대 33%)
   - 약함: 트램폴린 19% · 레이저 태그 21% · 클라이밍 벽 22% · 유령의 집 22% · 정보 안내 센터 22%
   - 강함: 산악 롤러코스터 48% · 바이킹 45% · 빠른 스낵바 45%
   - 조정 수단: `src/engine/data/cards.ts`의 `EFFECTS` 효과 보강. xlsx 원본은 수정하지 않는다.
6. **건설 중심 AI 약함**(성향 혼합 승률 25%): 규칙 문제인지 AI 판단 문제인지 가린다.
7. **사람 플레이테스트**: 입찰 심리전, 배치 고민, 1라운드 정산 시간(목표 1분 이내)을 실제 플레이로 확인한다. 웹 UI 흐름도 함께 확인한다.

## 공모전 검토
- `docs/contest-review.md`: 2027 코리아보드게임즈 공모전 검토(2026-10-14, 마감 2026-12-31). 이번 공모전은 비추천, 다음 공모전 대비 할 일(차별점 정의 등) 체크리스트. 규칙 아님.

## 자료 (`notes/`)
- `놀이공원_v1.xlsx` — 초기 기획(v1): 룰북v2, 시설 카드(50장), 이벤트 카드(20장). 게임명 "Fantasy Park Tycoon", 라운드 단계(경영→이벤트→건설→관람객 입장→수익→평가), 만족도 트랙 승리.
- 두 자료는 규칙이 다르다(v1 경영포인트 방식 vs pptx 인력/토큰 방식). 충돌 시 pptx를 우선하고, 불명확하면 사용자에게 확인한다. 원본 notes/는 직접 수정하지 말고 필요 시 새 파일/문서로 정리한다.

## 용어
시설 유형: 스릴형/패밀리형/공포형/어드벤처형/교육형/물놀이형/놀이형/상점/부대시설. 관람객: 어린이/성인. 수치: 건설비용·유지비·수익(어린이/성인)·만족도(어린이/성인)·특수효과.

## 플랫폼 방향
- 모바일 환경에 최적화한 게임으로 만든다(터치 입력, 세로 화면 우선, 작은 화면에서의 가독성, 한 손 조작, 카드·토큰 UI는 탭/드래그 기준).
- 최종 목표는 구글 플레이스토어 앱 출시이나, 현재 단계에서는 **웹 브라우저에서 바로 테스트 가능**해야 한다. 모바일 브라우저 및 데스크톱 브라우저의 모바일 뷰포트에서 동작을 확인한다.
- 나중에 앱으로 포장(WebView/Capacitor/TWA 등)하기 쉽도록 웹 기술 기반(반응형, PWA 친화적)으로 구현하고, 플랫폼 종속 코드는 분리한다.
- 게임 로직(규칙·카드 데이터)은 UI와 분리해 두어 웹 테스트와 이후 앱 출시에서 재사용한다.

## 작업 도구 (`.claude/`)
- agents: `game-designer`(규칙·메카닉 설계), `balance-analyst`(카드 수치 밸런스 분석), `rulebook-writer`(룰북 문서화·일관성 검토)
- skills: `/commit-push`, `/balance-check`, `/notes-sync`

## 작업 규칙
1. 모든 작업 후 git commit & push를 반드시 진행한다. **일상 작업은 `dev`(기본 브랜치)에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub 루트 `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.
2. commit 메시지는 가급적 한국어로 작성한다.
3. 문서·답변·카드 텍스트는 한국어로 작성한다.
4. 카드 수치를 바꾸면 영향(밸런스, 룰북 서술)을 함께 확인한다.

## 개발 (2026-11-25 GameHub 공통 구조로 옮김)
- 스택: TypeScript strict, React 19 + Vite, 공통 `@gamehub/ui/theme.css`(Tailwind v4) 위에 게임 부품 CSS(`src/client/style.css`, `@layer components`, 색은 `--gh-*`). 공통 코드: `@gamehub/net`(방·진행·대리 봇·한 기기 `LocalGame`·온라인 `useRoom`), `@gamehub/ui`(HomeScreen·WaitingRoom·GameShell·PlayerStrip). 린트·tsconfig·Vite 설정은 루트 공통(`packages/config`).
- `src/engine/` — UI 무관 순수 게임 로직(`engine.ts`의 `newGame`/`play`/`dispatch`, AI, 대리 봇 `botAction`, 카드 데이터 `data/`). React·DOM·`Math.random`·`Date.now` 금지(ESLint). 시설 원본은 `python tools/gen_facilities.py`로 xlsx에서 생성(`data/facilities.ts`), 카드 인쇄값 변환·특수효과는 `data/cards.ts`, 관객 그룹은 `data/groups.ts`, 운영카드는 `data/events.ts`. 카드 목록 문서는 `npx tsx scripts/cards-md.ts > docs/cards.md`로 재생성.
- `src/def.ts` — GameDef: 행동 검사(`parseAction`), 지금 둘 좌석(`actorsOf`), 좌석별로 가린 view, 대리 봇. 봇 자리는 엔진 AI(`isAI`)가 엔진 안에서 바로 둔다(옛 진행과 같다). 봇끼리 판이면 0번 자리를 엔진의 사람으로 두고 대리 봇이 진행을 맡는다.
- 숨은 정보(view): 난수 상태, 덱 순서(정렬해 보냄), 공개 전 남의 홍보 입찰액(`bidDone`만), 운영 결과 전 남의 입장료·배치. 끝나면 모두 공개.
- `src/client/` — React 화면: `App`(처음·대기실·한 기기·온라인·돌려 하기 가림 화면), `Game`(GameShell 대국), `Report`(운영 결과), `Rules`, `parts`(카드·시트), `platform/`(저장·햅틱·뒤로가기·서비스워커, 앱 포장 시 교체).
- `server/app.ts` = `createRoomApp(def)`. 빌드가 `server-dist/app.cjs`로 묶고 허브가 `scripts/aws/hub-entry.mjs`로 불러 실행한다(inproc).
- 테스트: `test/engine.test.ts`(규칙), `test/legacy.test.ts`(옮기기 전 엔진 기록 `test/fixtures/legacy-games.json`과 행동마다 상태 해시 비교), `test/def.test.ts`. 화면: `e2e/mobile.mjs`(iPhone 17 Pro, 모든 모드, `shots/*.png`).
- 명령(게임 폴더, 설치는 GameHub 루트에서 `npm install` 한 번): `npm run dev`(화면 + 온라인 방 서버 /ws) / `npm run build` / `npm start`(허브 방식 실행) / `npm test` / `npm run typecheck` / `npm run e2e` / `npm run sim`·`npm run balance`(`npx tsx`). 커밋 전에는 루트에서 `npm run check`·`npm run e2e`.
- 클라이언트는 절대경로를 쓰지 않는다(허브 `/smilepark/` 아래). localStorage 키는 `smilepark:` 접두어(`smilepark:local` 이어 하기, 공통 HomeScreen 의 `smilepark:name`·`smilepark:seats`, 온라인 `smilepark:session`).
- 이모지/시스템 이모티콘은 쓰지 않고 `src/client/Icon.tsx`의 커스텀 SVG 아이콘만 쓴다.
- 이미지 에셋: `public/images/<슬롯키>.webp`에 넣으면 자동 적용(없으면 플레이스홀더). 슬롯 정의는 `src/client/assets.ts`, 목록/크기는 개발 서버(`npm run dev`)에서 앱 주소 뒤 `#assets`(운영 빌드에서는 비활성).
- 현재 구현 룰은 `docs/design-v1.md`(pptx의 빈 부분을 채운 것, **오프라인 보드게임 기준**: 카드 인쇄값 그대로, 확률·환산 공식 없음, 손계산 가능). 룰 상수(`CFG`)·인쇄값 변환(`PRINT`)을 바꾸면 `npx tsx scripts/balance.ts`로 영향을 확인하고, 카드 원본(xlsx)은 수정하지 않는다. 엔진을 바꾸면 `test/legacy.test.ts` 기록과 달라지는 것이 의도한 규칙 변경인지 확인한다.

## 플레이 모드
1. **한 기기 AI 대전** — 사람 1명 + 봇(AI, 균형 성향) 1~4명.
2. **돌려 하기** — 한 기기에서 사람 2~5명(+봇). 건설·관객 고르기는 차례대로, 입찰·운영·관리는 사람마다 따로. 비밀 단계(홍보 입찰, 운영 입장료·배치)에서 둘 사람이 바뀌면 가림 화면. 운영 결과의 '관리 단계로'는 한 번만 누른다.
3. **봇끼리 관전** — 모든 자리를 봇으로 두면 0번 자리가 진행을 맡아 한 수씩 둔다. 메뉴에서 일시정지.
4. **온라인 대전** — 방 만들기(4자리 코드·`?room=` 초대 링크) → 대기실 → 방장 시작, 빈자리는 봇. 재접속(새로고침), 끊긴 사람 차례는 45초 뒤 대리 봇, 게임 중 나가면 그 자리는 봇. 관전은 공개 정보만.
- 이어 하기: 한 기기 판은 행동 기록을 저장해 처음 화면의 "이어 하기"로 돌아온다. 서버 재시작(배포) 시 온라인 방은 사라진다.

## 대국 화면 배치 (GameShell ①~⑤)
① 할 일(내 차례·기다리는 중)과 라운드·단계·운영카드 ② 공원 줄(만족도·돈·선, 누르면 그 공원 보기) ③ 진행 단계·운영카드(다음 카드)·최근 소식·공원 보드(부지 6칸·인력·토큰·입구) ④ 시설 시장 / 관객 줄·입찰액 / 관객 고르기 / 입장료 / 배치할 그룹 / 관리(수리·청소·고용) ⑤ 건설 마치기 / 입찰 공개 / 그만 데려오기 / 문 열기 / 비우기·추천·운영 시작 / 결과 보기 / 라운드 종료. ≡ 메뉴: 진행 기록·규칙·운영 결과·(봇끼리) 일시정지·나가기

## 배포
- GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs`, 접속 `http://54.116.67.196/smilepark/`). `main` 병합 시 루트 `deploy.yml`이 `deploy-smilepark.yml`(→ 공통 `deploy-workspace-game.yml`)을 불러 빌드 결과(`dist`, `server-dist`)를 올리고 허브를 재시작한다. 예전 단독 포트·systemd·`serve.mjs`·`deploy-remote.sh`는 없앴다.
