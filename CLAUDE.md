# 테서랙트 (TESSERACT) — 온라인 버전

주사위 퍼즐 보드게임 「테서랙트」를 오프라인 제작 전에 **모바일 최적화 웹 게임**으로 먼저 구현하는 프로젝트입니다.

## 필수 작업 규칙

- **단계별 작업이 끝나면 반드시 git commit & push를 진행한다.** (`/commit-push` 스킬 사용)
  - 원격: `origin` = https://github.com/gillettef/Tesseract.git, 기본 브랜치 `dev`
  - **일상 작업은 `dev`(기본 브랜치)에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(`.github/workflows/ci.yml`)만 돌고, `main` 병합이 곧 운영 배포다.
  - 테스트·타입 체크가 실패한 상태로는 커밋하지 않는다. 실패하면 고치거나, 사용자에게 알리고 지시를 받는다.
- **commit 메시지는 가급적 한국어로 작성한다.** 형식은 `/commit-push` 스킬 참고.
- 사용자와의 대화, 문서, 코드 주석도 한국어를 기본으로 한다. 식별자(변수·함수·파일명)는 영어.

## 규칙의 단일 출처

- 게임 규칙은 **`docs/rule.md`**(현재 v0.8)가 유일한 기준이다. `docs/rule_v0.*.md`는 과거 버전 기록이므로 구현에 쓰지 않는다.
- 규칙이 모호하거나 빠진 부분은 **추측해서 구현하지 않는다.** 사용자에게 묻고, 결정된 내용은 사용자 동의를 받아 `docs/rule.md`에 반영한다.
- 구현 중 규칙 자체의 문제(밸런스, 모순)를 발견하면 코드로 몰래 고치지 말고 사용자에게 보고한다.
- 규칙을 구현하거나 바꿀 때는 `/implement-rule` 스킬 절차를 따른다.

## 기술 스택 (기본값, 변경 시 이 문서도 갱신)

| 영역 | 선택 |
|---|---|
| 언어 | TypeScript 6 (strict, `noUncheckedIndexedAccess`) |
| 클라이언트 | React 19 + Vite 8, 모바일 우선 반응형, PWA 매니페스트 |
| 스타일 | Tailwind CSS v4 (`@tailwindcss/vite`). 색·글꼴·애니메이션 토큰은 `src/app/global.css`의 `@theme` 한곳 |
| 규칙 엔진 | 프레임워크 의존 없는 순수 TS (`src/engine/`). ESLint가 엔진 안의 React import, `Math.random`, `Date.now`, `window`/`document`를 에러로 막음 |
| 테스트 | Vitest 5 (`src/**/*.test.ts(x)`) |
| 린트 | ESLint 10 flat config + typescript-eslint |
| 멀티플레이 | 로컬(한 기기 돌려 쓰기 + 봇) + 온라인(Node `ws` 서버 `server/`, 행동 기록 동기화) |
| 배포 | AWS EC2 공용 서버, 포트 8092 (아래 「배포 (AWS)」) |

## 아키텍처 원칙

- **엔진은 순수 함수 리듀서**: `applyAction(state, action) => state`. React, DOM, 네트워크, `Math.random`, `Date`를 엔진에서 쓰지 않는다.
- **난수는 시드 기반 RNG**를 상태에 포함해 결정적으로 만든다. 같은 시드 + 같은 행동 기록 = 같은 게임. (테스트·리플레이·온라인 동기화용)
- **상태는 직렬화 가능한 JSON**으로 유지한다. 클래스 인스턴스, 함수, Map/Set을 상태에 넣지 않는다.
- 합법 행동 판정(`getLegalActions`)과 행동 적용은 엔진에만 둔다. UI는 엔진이 허용한 행동만 보여 준다.
- 주사위 방향은 `윗면 + 앞면`으로 표현하고, 회전·면 계산은 `src/engine/dice.ts` 한곳에서만 한다.
  - 전용 주사위: 면 1~5 + ⧗. **면 배치는 주사위마다 다름**(회전 동치 30종 × 4개 = 120개, v0.8 `layoutClasses`). 주사위별 배치를 상태에 담는다
  - **면마다 색이 다름**(v0.7): 숫자 면 1~5에 5색이 하나씩(짝은 주사위마다 무작위, `Die.colors`), ⧗ 면은 무색. **주사위의 색 = 윗면의 색**이라 상태에 색을 따로 두지 않고 `dieColor`/`faceColor`(dice.ts)로 계산한다
- 카드(우주 법칙, 목표, 개인 목표, 사건)는 **데이터 + 판정 함수** 형태로 정의해 하나씩 추가할 수 있게 한다. 사건 카드는 `src/engine/events.ts`(시작 사건 = 넘기기 규칙 `tipRules`, 끝 사건 = `resolveEndEvent`).
- 4라운드(v0.8): 준비 때 사건 2장 공개 → ⧗ 주사위·자유 넘기기(`time.free`, 행동 `pass`) → 끝 사건 → 4라운드 목표(모두 3점) → 4차원 점수(꼭대기 지도 `scoreTops`) 순서로 `finishRound4`에서 정산

## 디렉터리 구조 (계획)

```
docs/            규칙서와 설계 문서
src/engine/      규칙 엔진 (순수 TS) + __tests__/
src/ui/          React 컴포넌트, 화면
src/app/         라우팅, 상태 연결, 저장
public/          아이콘, 매니페스트
```

## 모바일 UI 원칙

- 기준 화면 360×640(세로). 가로 스크롤 금지, 좌우 여백 최소 16px.
- 터치 대상은 최소 44×44px. 호버에 의존하는 정보 금지 (탭·롱프레스로 대체).
- 개인 보드(5×3 + 기둥 높이)는 한 화면에 들어와야 한다. 기둥 내부 주사위는 탭해서 펼쳐 본다.
- 주사위 윗면·앞면·색은 색맹도 구분 가능하게 **색 + 모양/라벨**을 함께 쓴다.
- 조작 반응 애니메이션은 짧게(≤300ms). 차례 배너·스스로 버린 잔해 팝업 같은 가벼운 연출은 들어오고 나가는 구간만 ≤300ms로 하고 터치를 막지 않는다(`pointer-events: none`). `prefers-reduced-motion`이면 모두 끈다.
- **플레이어가 확인해야 할 사건**(라운드 시작, 라운드 목표 달성, 라운드별 기본 점수 확정, 4라운드 끝 사건 발동, 이 기기 사람이 강제로 얻은 잔해)은 **확인 모달**(`src/ui/NoticeModal.tsx`)로 보여 주고 「확인」을 눌러야 넘어간다. 한 행동으로 생긴 알림은 한 장에 모은다. 모달이 떠 있는 동안 봇은 기다리고, 게임 끝 알림을 다 확인해야 결과 화면으로 간다. 봇·원격 플레이어의 잔해와 스스로 버린 잔해는 짧은 팝업. 묶는 규칙은 `src/ui/notices.ts`의 `buildNotices`.
- **되돌리기**: 로컬 게임에서 이 기기 사람의 마지막 수(시장 가져오기·놓기·버리기, 4라운드 넘기기·잔해)를 다음 사람이 두기 전까지 되돌린다. 주사위를 굴려 나온 결과(시장 채우기, 다시 굴리기)가 낀 뒤, 라운드가 바뀐 뒤, 온라인 게임은 되돌리지 않는다. 4라운드는 굴리기가 아니라 넘기기라 되돌릴 수 있다 (사용자 결정 2026-10-23, `canUndo` in `src/app/session.ts`). 실수 방지는 기본적으로 두 번 눌러 확정
- 선택지가 하나뿐인 상황(바퀴 마지막 사람의 남은 묶음, 넘길 ⧗이 하나뿐)은 강조하거나 미리 골라 두고, 놓을 칸이 없는 주사위는 고르기 전에 표시한다.
- 사건(라운드 전환, 목표 달성, 잔해 등)은 마지막으로 본 상태와 비교해 `src/ui/fx.ts`의 `diffEvents`에서 찾는다. 엔진에 연출용 상태를 넣지 않는다.

## 비주얼 디자인 (Claude Design 캔버스)

- 카드, 보드, 주사위, 화면 등 디자인과 이미지는 **Claude Design 캔버스**에서 만든다: https://claude.ai/artifact/WYyxf5zZtrTtLVx6DcxHY9
  - 보드: 비주얼 시스템(색·면·전개도·글꼴), 모바일 3라운드 화면, 개인 차원 보드, 카드 템플릿
  - 새 디자인이나 수정은 이 캔버스에 보드를 추가·수정하는 방식으로 한다. 새 캔버스를 만들지 않는다.
- 코드의 색·글꼴은 캔버스와 맞춘다:
  - 바탕 `#14121f`, 면 `#1f1c30`, 선 `#34304d`, 본문 `#ece9ff`, 보조 `#a49fc4`, 포인트 `#9b8cff`
  - 주사위 면 색(기호): 빨강 `#E5484D`(▲), 파랑 `#3B7BF6`(●), 초록 `#34C483`(■), 노랑 `#F5C842`(★), 검정 `#2B2838`(◆, 테두리 `#6d6890`), ⧗ 면은 무색 진주빛 `#cfcbe3`(기호 없음). v0.7부터 색은 주사위가 아니라 면마다 칠함 — 캔버스의 주사위 디자인도 갱신 필요
  - 카드 머리띠: 우주 법칙 `#9b8cff`, 라운드 목표 `#5ad1e6`, 개인 목표 `#f2a65a`, 사건 `#ff8a7a`
  - 카드 v2 (캔버스 「카드 v2」 보드, 사건 카드 포함): 각진 SF 프레임(왼위·오른아래 모서리 자름), 종류 띠·태그, 성운 일러스트 창, 육각 점수 배지. 크기 셋 — 축소(mini, 라운드 시작 알림), 기본(normal, 카드 시트·개인 목표 고르기), 확대(large, 누르면 `CardZoom`)
  - 카드 일러스트는 카드 조건을 주사위 도해로 그린 데이터(`src/ui/cardArtData.ts`). 앱(`CardArt.tsx`)과 캔버스가 같은 데이터를 쓰며, 카드를 추가하면 그림도 추가하고 `npx tsx scripts/gen-cards-board.ts <출력>`으로 캔버스 보드를 다시 만든다
  - 글꼴: 제목·숫자 Space Grotesk, 본문 Noto Sans KR. ⧗은 모래시계 선 아이콘(텍스트 문자 대신)
- 캔버스에서 디자인이 바뀌면 이 목록도 갱신한다.

## 개발 단계 (로드맵)

1. ~~프로젝트 초기화 (Vite + React + TS + Vitest, 린트)~~ ✅
2. ~~엔진: 주사위 모델·RNG·상태 타입~~ ✅
3. ~~엔진: 1~3라운드 (시장, 배치, 쌓기, 기본 점수)~~ ✅
4. ~~엔진: 4라운드 (시간 세기, 돌리기, 인과 역류) + 최종 점수~~ ✅ (v0.5 기준)
   - ~~4b. 엔진: v0.6 반영 — 주사위별 면 배치, ⧗ 위 쌓기 금지, 4라운드 ⧗ 넘기기~~ ✅
5. ~~엔진: 카드 (우주 법칙, 라운드 목표 1~3, 개인 목표)~~ ✅
   - 5b. ~~v0.8: 4차원 점수(꼭대기 지도), 4라운드 목표, 사건 카드, 자유 넘기기, 거울·영원의 우주~~ ✅ (타인의 과거 개입 고급 규칙은 미구현)
6. UI: 로컬 핫시트 플레이 (모바일)
7. 봇 (간단한 휴리스틱)
8. 온라인 멀티플레이
9. 플레이테스트 지원 (리플레이, 통계 → 규칙 밸런스 피드백)

각 단계가 끝날 때마다 commit & push 한다.

## 명령어

```
npm run dev        # 개발 서버
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run lint
npm run build      # tsc + vite build + 서버 번들(server-dist/server.cjs, rolldown)
npm start          # 빌드 결과로 서버 실행 (scripts/aws/serve.mjs, EC2와 같은 진입점)
```

## 배포 (AWS)

- 다른 게임(Eleven·MagicAcademy·Rootbound·SmilePark·DoubleAgent)과 같은 EC2(t4g.nano, 서울) 1대를 공유한다. 접속은 **http://54.116.67.196:8092** (HTTP만, HTTPS 없음).
- `main`에 병합되면 `.github/workflows/deploy-aws.yml`이 `npm test` → `npm run lint` → `npm run build`를 통과했을 때만 `dist`·`server-dist`(ws까지 묶은 서버 번들)·`scripts/aws/`를 `~/tesseract`에 올리고, 서버에서 `scripts/aws/deploy-remote.sh`가 systemd `tesseract`(포트 8092)를 재시작·헬스체크(`/health`)한다. 정적 파일과 온라인 대전 WebSocket(`/ws`)을 같은 포트로 서빙한다. 재시작하면 진행 중인 온라인 방은 사라진다.
- 서버 번들은 Vite 8에 딸린 rolldown으로 만든다(esbuild는 선택 의존성이라 CI에 없을 수 있음). EC2에서는 빌드·`npm install`을 하지 않는다.
- **수동 배포**(push 없이): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1`. SSH 키·IP는 `.dev/astraltab-key.pem`, `.dev/aws-public-ip.txt`(git 제외), 없으면 `../Rootbound/.dev/`의 것을 쓴다.
- 서버 로그: `ssh -i ../Rootbound/.dev/astraltab-key.pem ec2-user@54.116.67.196 "sudo journalctl -u tesseract -n 100"`
- SSH(22)는 관리자 IP만 열려 있어 워크플로가 러너 IP를 임시로 열었다 닫는다. 저장소 시크릿: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_SECURITY_GROUP_ID / EC2_HOST / EC2_HOST_KEY / EC2_SSH_PRIVATE_KEY (다른 게임 저장소와 같은 값).
- 서버 준비(완료, 2026-10-23): `scripts/aws/provision.sh` → `scripts/aws/units.sh`, 보안 그룹 TCP 8092 인바운드 추가.

## 서브에이전트

- `rules-auditor`: 엔진 구현이 `docs/rule.md`와 일치하는지 검증 (읽기 전용)
- `engine-tester`: 규칙 조항별 Vitest 테스트 작성
- `mobile-ui-reviewer`: 모바일 사용성·접근성 검토 (읽기 전용)
