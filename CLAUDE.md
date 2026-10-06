# SmilePark (놀이공원 보드게임)

놀이공원을 경영해 가장 높은 만족도(VP)를 얻는 2~5인 경영 보드게임의 기획·규칙·카드 데이터를 관리하는 프로젝트.

## 자료 (`notes/`)
- `놀이공원_v1.xlsx` — 초기 기획(v1): 룰북v2, 시설 카드(50장), 이벤트 카드(20장). 게임명 "Fantasy Park Tycoon", 라운드 단계(경영→이벤트→건설→관람객 입장→수익→평가), 만족도 트랙 승리.
- `놀이공원.pptx` — 개정 룰 슬라이드(최신으로 간주): 관객카드/시설카드/수리·쓰레기 토큰/운영카드, 개인보드(관객·시설·운영), 인력 트랙(엔지니어·마케팅 전문가·환경 미화원·안내 직원·연구원), 턴 진행 건설→홍보→운영→관리, 돈($1/$2/$5)과 VP(1/5).
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
1. 모든 작업 후 git commit & push를 반드시 진행한다.
2. commit 메시지는 가급적 한국어로 작성한다.
3. 문서·답변·카드 텍스트는 한국어로 작성한다.
4. 카드 수치를 바꾸면 영향(밸런스, 룰북 서술)을 함께 확인한다.

## 개발 (`src/`)
- 스택: TypeScript + Vite + React. `npm run dev`(웹 테스트, 모바일 뷰포트로 확인) / `npm run build` / `npm test` / `npm run sim`(AI 대전 요약). 밸런스 측정·조정 도구는 `scripts/`(simulate·balance·sweep·cardeval·econ·tune-ai·pipeline), 절차와 결과는 `docs/balance-report.md`.
- `src/game/` — UI 무관 순수 게임 로직(`engine.ts`의 `dispatch`/`newGame`, 카드 데이터 `data/`). 시설 데이터는 `python tools/gen_facilities.py`로 xlsx에서 생성.
- `src/ui/` — 모바일 세로 우선 UI. `src/platform/` — 저장/햅틱 등 플랫폼 종속 코드(앱 포장 시 교체).
- 이모지/시스템 이모티콘은 쓰지 않고 `src/ui/Icon.tsx`의 커스텀 SVG 아이콘만 쓴다.
- 이미지 에셋: `public/images/<슬롯키>.webp`에 넣으면 자동 적용(없으면 플레이스홀더). 슬롯 정의는 `src/ui/assets.ts`, 목록/크기는 개발 서버(`npm run dev`)에서 앱 주소 뒤 `#assets`(운영 빌드에서는 비활성).
- 현재 구현 룰은 `docs/design-v0.md`(pptx의 빈 부분을 임시로 채운 것). 인원은 사람 0~1 + AI로 전체 2~5인(`CFG.minPlayers`~`maxPlayers`), 한 기기 다인(핫시트) 미지원. 룰 상수(`CFG`)를 바꾸면 `npx tsx scripts/balance.ts`로 영향을 확인하고, 카드 원본(xlsx)은 수정하지 않고 룰 상수로 조정한다.

## 배포 (AWS)
- 다른 게임(Eleven·AstralTab·MagicAcademy)과 같은 EC2(t4g.nano) 1대를 공유한다. SmilePark는 정적 웹앱이라 `main`에 push하면 `.github/workflows/deploy-aws.yml`이 `npm test` → `npm run build`를 통과했을 때만 `dist`와 `scripts/aws/serve.mjs`(의존성 없는 정적 서버)를 `~/smilepark`에 올리고 systemd `smilepark`(포트 **8090**)를 재시작한다. 접속은 `http://<Elastic IP>:8090`.
- SSH(22)는 관리자 IP만 열려 있어 워크플로가 러너 IP를 임시로 열었다 닫는다. 저장소 시크릿: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_SECURITY_GROUP_ID / EC2_HOST / EC2_HOST_KEY / EC2_SSH_PRIVATE_KEY (다른 게임 저장소와 같은 값).
- 최초 1회: EC2에서 `scripts/aws/provision.sh` → `scripts/aws/units.sh` 실행, 보안 그룹에 TCP 8090 인바운드 추가.
