# 검은 왕관 (blackcrown)

공용 보드 탐험 + 자체 문양 카드 족보 전투 RPG. 9라운드 뒤 대관식에서 "가장 빛나는 자"가 검은 왕관을 쓰고 마왕이 되는 반전. 3~5석(사람 1~5 + 봇).

## 문서

- 규칙(정본): `docs/design.md`. 규칙·수치를 바꾸면 이 문서도 같이 고친다.
- 비주얼: `design/README.md`(색·글자·모션·구현 규칙), `design/tokens.css`·`components.css`(클라이언트가 그대로 import), `design/emblems.svg`(스프라이트), `design/mockups/*.html`(클래스 조합 정답 참고본).

## 구조

- `src/engine/` 순수 규칙(React·DOM·시간·`Math.random` 금지, 시드 난수 `rng.ts`)
  - `hands.ts` 족보 판정(와일드·숫자/문양 바꾸기는 판정이 최적값을 고름)
  - `data.ts` 아이템·몬스터·직업·칸 타일 묶음·경험치 표
  - `tiles.ts` 육각 판 19장(앞뒤) 데이터(생성기 `tools/tiles-gen.ts`, 손으로 고쳐도 됨), `board.ts` 판 섞어 놓기·칸/길 그래프·거리(길을 따라 센 칸 수)
  - `game.ts` 상태·행동·진행·대관식·최종전·`view`(비공개 정보 숨김). 규칙 위반은 `IllegalAction`, 상태는 `structuredClone` 뒤 바꾼다
  - `bot.ts` 봇(난이도 0~2)
- `src/def.ts` GameDef(`parseAction` 은 형식만 본다)
- `src/client/` React 화면. 배치는 GameShell ①~⑤. 계산 도우미는 `helpers.ts`, 화면 조각은 `ui.tsx`
- `tools/sim.ts` 밸런스 시뮬레이터(`npx tsx tools/sim.ts 300`), 지표 목표는 `docs/design.md` 19절

## 규칙

- 비공개: 남의 손패·그림자 값·저주 유물(공개 전)·뒤집히지 않은 타일·뽑을 더미·난수는 `view` 에 넣지 않는다. 로그(`ctx.log`)에도 쓰지 않는다.
- 화면 미리보기는 엔진 함수(`previewAttack`, `previewSmite`, `pendingDamage`)를 `asState(view)` 로 부른다. 이 함수들은 View 에 있는 필드만 써야 한다.
- 진행 중 공격의 카드는 `attack.shown` 으로 공개한다(협공 미리보기용).
- 절대경로 금지, 스프라이트는 `?raw` 로 문서에 한 번만 넣는다. localStorage 키는 `blackcrown:` 접두어.
- 검사: `npm run typecheck|test|build|e2e -w games/blackcrown`. e2e 는 한 기기 봇 대전을 대관식·최종전·결과까지 두고 온라인 대기실·재접속을 확인한다.
