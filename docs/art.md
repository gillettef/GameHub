# 네오테라 아트 키트

행성의 밤하늘, 포자 안개, 토착 생물, 궤도 위성을 바탕으로 한 다크 테마 시각 자산. 아이콘·카드 프레임·문장·로고는 직접 설계한 벡터(SVG)다. **회화 장면·구조물(식민지 풍경, 테크 웹 지도, 홈 히어로)만 WebP 래스터를 허용**한다 — 아래 "회화풍 래스터 자산". 웹폰트는 쓰지 않는다.

- Claude Design 캔버스(디자인 확인용, 비공개): https://claude.ai/artifact/34UtDyLuoFUUSyCgUrpeHh
  - 아트보드: 토큰·로고·배경 / 아이콘 34종 / 카드 프레임 15종 / 노선 문장·시대 배너·모션 / 랜딩(홈) 402 폭(모션 실시간 재생)
- **정본은 이 저장소의 파일**이다. 캔버스를 고쳤으면 해당 SVG/CSS 도 같이 고친다.

## 파일 목록

| 경로 | 내용 |
|---|---|
| `src/ui/styles/tokens.css` | `:root` 색·간격·모양·글꼴·그림자 변수 |
| `src/ui/styles/motion.css` | keyframes 와 `.anim-*` 유틸 클래스 |
| `src/ui/assets/bg-sky.svg` | 앱 배경. viewBox 430×932, `preserveAspectRatio="xMidYMid slice"` |
| `src/ui/assets/landing/{sky,planet,ground}.webp` | 홈 히어로 회화 3장(800×720 = viewBox 400×360 의 2배). 하늘(불투명) / 고리 행성·달(투명, 중심 (262,118) r64) / 지평선·생물발광 계곡·정착지 불빛(투명, 지평선 꼭대기 (200,244)) |
| `src/ui/components/LandingHero.tsx` | 홈 히어로 인라인 SVG — 위 세 장을 `<image>` 로 깔고 위성·별똥별·안개·테크 웹·착륙선·포자를 얹는다. 모션은 `LandingHero.module.css` |
| `src/ui/assets/scene/era{1..4}.webp` | 식민지 풍경 배경 840×980(1 착륙지 노을 · 2 정착촌 오로라 밤 · 3 궤도 도시 · 4 결실 금빛 새벽). 빈 터(돌 테두리 원판)를 자리 좌표에 구워 둠 |
| `src/ui/assets/scene/buildings.webp` | 건물 아틀라스 5열(농장·제작소·발전소·연구소·회관) × 4행(기초·Lv1~3), 칸 240×200, 땅선 y172. 발전소·회관 기초 칸은 비어 있음 |
| `src/ui/assets/scene/units.webp` | 유닛 아틀라스 4열(경비대·기동대·포대·비행대) × 4행, 칸 220×180, 땅선 y158 |
| `src/ui/assets/scene/legacy.webp` | 유산 기념물 5칸(0 짓는 중 비계, 1~4 완성: 금빛 오벨리스크·개척자 동상·고리 인 아치·빛나무), 칸 120×150 |
| `src/ui/assets/scene/props.webp` | 실물 토큰 9칸 64×64: 정착민 말, 자원 5종(식량 꼬투리·생산 육각 덩이·에너지 원반·과학 결정 큐브·문화 보석), 지휘 구슬(흰), 방위 구슬(빨강), 빈 홈 |
| `src/ui/assets/scene/layout.json` | 장면 자리 좌표(x, 땅선 base, scale). 굽는 스크립트와 `ColonyScene.tsx` 가 함께 읽는다 |
| `src/ui/assets/techweb/map.webp` | 테크 웹 바탕 행성 지도 768×768(viewBox 384 의 2배, 중심 384,384). 방향 순서는 판마다 달라 방향색은 굽지 않음 |
| `src/ui/components/ColonyScene.tsx` | 식민지 풍경 장면·생산 칩 띠·자원 토큰 트레이·행동 구슬 |
| `src/ui/assets/logo.svg` | 심볼(고리 행성 + 새싹 + 세 노선 위성) + 기하학 획 워드마크 "네오테라". viewBox 324×96 |
| `src/ui/assets/icons/*.svg` | 24×24 단색 아이콘 34종 |
| `src/ui/assets/cards/*.svg` | 카드 프레임 15종, viewBox 250×350 |
| `src/ui/assets/emblems/{ark,symbiont,synth}.svg` | 노선 문장 120×120 (고정 색) |
| `src/ui/assets/emblems/era{1..4}.svg` | 시대 전환 배너 360×120 (1 착륙 · 2 정착 · 3 궤도 · 4 종료/결실) |


전체 SVG 약 50KB(목표 400KB 이하), 배경 약 8KB. WebP 래스터 합계 약 455KB(목표 1.5MB 이하, 장면 1장 200KB 이하).

## 회화풍 래스터 자산(WebP)

참고한 느낌: 테이블 위 보드게임 풍경 — 내 문명이 한 장의 풍경 그림이고, 건물은 지형 위 구조물 그림(레벨마다 그림이 바뀜), 정착민은 건물 옆 말, 유닛은 깃발 든 무리, 유산은 기념물, 자원은 빛나는 실물 토큰. 다른 게임의 그림·구도·명칭은 옮기지 않고 네오테라 세계관(착륙지 → 정착촌 → 궤도 도시, 포자 안개, 생물발광 식생, 세 노선 색)으로 직접 그렸다.

- **만드는 법**: 이미지 생성 모델 없이 Python 이 그라데이션·조명·붓결 필터(feTurbulence + feDisplacementMap + soft-light 붓 자국)를 쓴 SVG 를 만들고, 헤드리스 Chrome 으로 투명 배경 캡처한 뒤 Pillow 로 WebP 저장한다. npm 라이브러리는 쓰지 않는다.
  ```
  python scripts/art/build_art.py            # 전부 다시 굽기
  python scripts/art/build_art.py scenes     # 일부만: buildings units legacy props scenes techweb landing
  ```
  - `scripts/art/paint.py` 도형·필터·굽기 도우미, `buildings.py` `units.py` `props.py` `scenes.py` `techweb.py` `landing.py` 그림별 코드. 생성된 SVG 원본은 `scripts/art/src/*.svg` 에 남는다(임시 PNG 는 `scripts/art/.tmp/`, git 제외). Chrome 경로가 다르면 `NT_CHROME` 환경 변수.
- **해상도**: 기기 2배 기준(402px 폭 → 장면 약 800px). 구조물·유닛·토큰은 알파 WebP 아틀라스로, CSS `background-position` 으로 칸을 고른다(`--atlas --cols --rows --ax --ay`). 같은 아틀라스를 2~4명 보드가 함께 쓴다. 장면 배경과 테크 웹 지도는 `<img loading="lazy">`.
- **색**: 래스터에는 CSS 변수가 닿지 않으므로 `paint.py` 의 `T` 표에 `tokens.css` 값을 옮겨 두고 구웠다. **`tokens.css` 색을 바꾸면 `T` 를 맞춘 뒤 다시 굽는다.** 노드 색·고리 색처럼 규칙상 의미가 있는 색은 래스터에 굽지 않고 SVG/CSS(토큰)로 그린다.
- **자리 좌표**: `assets/scene/layout.json` 을 바꾸면 빈 터 위치가 달라지므로 `scenes` 를 다시 굽는다.
- **누르는 영역**: 구조물 버튼은 같은 줄 이웃과의 간격 − 8 로 폭을 줄이고 땅선 위 120(×scale)만 덮는다. 그림 칸은 `pointer-events: none` 으로 버튼 밖으로 넘친다. 정착민 말 줄은 한 줄 고정이고 말이 4개를 넘으면 레벨마다 `×n` 으로 줄인다. 유산 광장은 그림 2개까지, 나머지는 이름판 `+n`(모두 아래 카드 칸에 있음).
- **원본 SVG**: `scripts/art/src/*.svg` 12장(합계 약 1MB)을 커밋 대상으로 남긴다. 스크립트만으로도 같은 결과를 다시 만들 수 있지만, 그림을 손보거나 비교할 때 쓴다.
- **구조물 그림**(레벨이 오를수록 커지고 바뀜): 농장 = 일군 밭과 천막 → 유리 온실 돔 → 쌍둥이 온실·물탑 → 층층 수직 농장 탑 / 제작소 = 천막 작업대·고철 → 굴뚝 단 조립 창고 → 용광로 공장 → 갠트리 크레인 제작 단지 / 발전소 = 태양 집광판 → 지열 냉각탑 → 떠 있는 고리를 두른 반중력 첨탑 / 연구소 = 탐사 천막·안테나 → 관측 돔 → 접시 안테나 연구 단지 → 결정 첨탑 학원 / 회관 = 깃발 천막 집회장 → 열주 회당 → 빛 돔 대회관. 유닛: 경비대 = 창 든 민병 → 방패 경비 → 강화복 소총대 → 두 발 보행 기계, 기동대 = 여섯 다리 토착 짐승 기수 → 호버 바이크 → 호버 전차, 포대 = 레일 포 → 플라스마 중포, 비행대 = 포함(砲艦) 드론. 유닛 깃발은 진홍(위험색 계열).
- 지금 그림은 절차적으로 그린 회화 흉내라서, 손으로 그린 일러스트만큼 세밀하지는 않다. 같은 아틀라스 칸 크기를 지키면 나중에 더 좋은 그림으로 바꿔 끼울 수 있다.

## 색 토큰

| 묶음 | 변수 | 값 | 용도 |
|---|---|---|---|
| 바탕 | `--bg` | `#0a0f1f` | 앱 바탕(밤하늘 남색) |
| | `--bg-elev` | `#10172b` | 하단 바·시트 바탕 |
| | `--surface` / `--surface-2` | `#161f38` / `#1f2a48` | 카드·패널 / 안쪽 칸·눌린 상태 |
| | `--border` | `#33406a` | 테두리·구분선 |
| 글자 | `--text` / `--text-dim` | `#e9edf8` / `#a6afcb` | 본문 / 보조 (모든 바탕 위 AA) |
| 강조 | `--accent` / `--accent-contrast` | `#f4c56a` / `#1b1305` | 주요 버튼(별빛 호박색) / 그 위 글자 |
| 상태 | `--ok` `--warn` `--danger` | `#5fd88f` `#ffb550` `#ff7a7a` | 성공·주의·위험 |
| 노선 | `--ark` `--symbiont` `--synth` | `#9cc2ff` `#3fe3b8` `#ff6cb0` | 방주(청백 금속)·공생(생물발광 녹청)·합성(자홍) |
| 노선 보조 | `--ark-2` `--symbiont-2` `--synth-2` | `#dfe9ff` `#b6ff7a` `#ff9a4a` | 그라데이션 끝점·장식(추가 토큰) |
| 고리 | `--ring1` `--ring2` `--ring3` | `#a9b6d6` `#b996ff` `#ffd67a` | 테크 웹 고리 1·2·3 (은회→보라→금, 밝기도 다름) |
| 자원 | `--res-food` `--res-prod` `--res-energy` `--res-sci` `--res-culture` | `#a3e06c` `#e7a768` `#ffe36b` `#74bdff` `#e595ff` | 식량·생산·에너지·과학·문화 |

- 노선·고리·자원·상태 색은 모두 `--surface` 위에서 글자색으로 써도 4.5:1 이상이다. 색만으로 구분하지 말고 아이콘을 함께 쓴다.
- 그 밖: `--radius 14px`, `--radius-sm 8px`, `--space-1..4` = 4·8·12·16px, `--font`(시스템 한글 스택), `--font-display`(제목용, 같은 시스템 스택에서 한글 고딕 우선), `--shadow`.

## 아이콘

`food prod energy sci culture command defense might health spore ark symbiont synth farm workshop power lab hall guard rider battery flyer satellite quest threat patron mission charter legacy pioneer supply colonist raid conflict`

- `raid`(습격): 사선 화살촉 + 속도선. `conflict`(분쟁): 교차한 두 창(창끝·손잡이 가로대). 습격·분쟁 카드의 그림 창 아이콘이다.

- 루트에 `stroke="currentColor" fill="none" stroke-width="1.8"` 가 있어 **인라인 SVG**로 넣으면 부모의 `color` 를 따른다. 예: 자원 칩에서 `color: var(--res-food)`.
- `<img>` 로 쓰면 currentColor 가 검정이 되므로, 색을 입히려면 CSS `mask-image: url(...)` + `background-color: currentColor` 방식을 권장한다(아래 사용 예). `innerHTML` 류로 SVG 문자열을 넣는 방식은 프로젝트 규칙상 쓰지 않는다.
- 24px 기준으로 그렸다. 16px 아래로 줄이지 않는다. 터치 타깃은 아이콘이 아니라 버튼이 44px 를 채운다.

## 카드 프레임

`pioneer legacy supply patron satellite mission raid conflict quest-back quest-judge quest-threat quest-contest quest-patron quest-fruition quest-finale`

- 글자 없이 테두리·띠·그림 창만 있다. 코드가 위에 글자를 절대 위치로 얹는다(250×350 기준 좌표, 실제 크기에 비례해 환산).
  - 상단 띠 y 8–58: 이름·종류. 왼쪽 비용 원 (31,33) r15 — 후원자·유산·자원 팟·습격·분쟁·후원 계약·위성. 퀘스트는 오른쪽 표식 칸 (196,18) 32×30, 위협형은 같은 자리 육각(위협도).
  - 그림 창 y 66–188 (후원자·유산은 아치형).
  - 구분선 y 197, 본문 y 205–290.
  - 노선 선택지 칸 y 296–330, x 18·92·166 (폭 66) — 판정형·위협형·경쟁형. 칸 색은 `--ark/--symbiont/--synth`.
  - 습격 `raid`: 오른쪽 위·왼쪽 아래를 사선으로 깎은 테두리, 띠에 발톱자국 세 줄, 아래에 속도선 + 화살촉. 분쟁 `conflict`: 팔각 겹테두리, 띠에 교차한 두 창, 비용 원 바깥 고리, 그림 창 모서리 리벳, 아래 제비꼬리 깃발 띠(y 304–330).
  - 유산 단계 마름모 4개 x 228, y 219·243·267·291. 위성 타이머 원 4개 y 318, x 86·112·138·164.
- 테두리·장식색은 **`currentColor`**, 루트 `color` 속성에 종류별 기본색이 들어 있다(후원자 호박, 유산 금, 자원 팟 청동, 판정 하늘, 위협 빨강, 경쟁 주황, 후원 제안 보라, 결실·종료 금, 후원 계약 난초, 위성 연청, 임무 녹색, 습격 위험 빨강 `#ff7a7a`, 분쟁 진한 주홍(적동) `#e8693f`). 인라인으로 넣고 CSS `color` 를 주면 노선색 등으로 바꿀 수 있다(예: 후원자 카드 `color: var(--ark)`).
- 바탕은 `style="fill:var(--surface,#161f38)"` 처럼 토큰을 쓰고 대체값을 둔다. `<img>` 로 써도 대체값으로 같은 모양이 나온다.
- 인라인으로 한 화면에 여러 장 넣을 때: `clipPath` id 가 파일마다 다르게(`ntSupClip`, `ntFinClip`, `ntMisClip`, `ntRaidClip`, `ntConClip`) 지정돼 있어 충돌하지 않는다. 같은 프레임을 여러 장 인라인하면 id 가 중복되지만 내용이 같아 표시에는 문제가 없다.

## 노선 문장·시대 배너

- 문장은 고정 색(그라데이션 포함)이다. 노선 선택 화면, 현황 탭 노선 트랙 머리, 결실 퀘스트 정산에 쓴다.
  - 방주: 육각 방패 + 푸른 지구 기억 + 받치는 선체 / 공생: 곧은 줄기에 감긴 촉수 덩굴 + 포자 빛 / 합성: 팔각 칩 + 회로 + 기계 눈.
- 시대 배너는 가운데(대략 x 90–270)를 비워 두었다. 시대 이름은 코드가 가운데에 얹는다. 테두리 색이 고리색과 맞는다(1 은회, 2 보라, 3 금, 종료 금).
- SVG 안의 gradient id 는 `ntArk*`, `ntSym*`, `ntSyn*`, `ntE1*`~`ntE4*` 접두어로 겹치지 않게 했다.

## 모션 (`motion.css`)

| 클래스 | 쓰임 | 기본 길이 |
|---|---|---|
| `.anim-card-in` | 카드 칸 채움. 칸마다 `style="--delay: 40ms"` 처럼 순차 | 320ms |
| `.anim-flip` | 퀘스트 공개(뒷면 → 앞면). 앞면 요소에 붙이고 부모는 같은 크기 유지 | 520ms |
| `.anim-orbit` | 위성 공전. 궤도 중심 래퍼에 붙이고 위성은 래퍼 안에서 반지름만큼 떨어뜨림 | 14s 무한 |
| `.anim-pulse` | 연구 가능한 테크 웹 노드(SVG `<g>`/`<circle>`에도 동작, `transform-box: fill-box`) | 1.8s 무한 |
| `.anim-hit` | 습격·위협 피격 시 식민지 패널 흔들림 | 420ms |
| `.anim-era` | 시대 전환 오버레이(나타남 → 머묾 → 사라짐). `animationend` 에서 제거 | 2.4s |
| `.anim-glow` | 카드 획득·노선 단계 도달 반짝임(`::after` 광채, `--accent`) | 700ms |
| `.anim-fade` / `.anim-sheet-up` | 시트 바탕 막 / 시트 올라옴 | 200 / 320ms |
| `.anim-toast` | 토스트 떠오름 → 머묾 → 흐려짐 | 2.2s |
| `.anim-tick` / `.anim-delta.up·down` | 숫자 변화 튐 / `+n`·`−n` 떠오름. `src/ui/motion.tsx` 의 `<Num>` 이 붙인다 | 420 / 1100ms |
| `.anim-turn` | 차례인 플레이어 칩 안쪽 광채 숨쉬기 | 1.8s 무한 |
| `.anim-shine` | 주요 버튼 빛 훑기(행동을 다 쓴 차례 종료·결과 보기·이어 하기) | 2.6s 무한 |
| `.anim-cue` | "내 차례입니다" 알림 띠 | 1.8s |
| `.anim-ripple` / `.anim-bloom` / `.anim-draw` | 연구 완료 노드 파문 / 꽃핌 / 새 연결선 그리기(`pathLength="1"`) | 900 / 560 / 600ms |
| `.anim-pop` | 새로 들어온 카드·정착민 말 톡 나타남 | 360ms |
| `.anim-alarm` | 칸 1 위협 퀘스트 붉은 경보 | 1.4s 무한 |
| `.anim-flash` | 피해 입은 보드 붉은 번쩍임 | 800ms |
| `.anim-rise` / `.anim-slide-in` | 결과판 줄·홈 요소 차례로 떠오름 / 최근 기록 새 줄 | 460 / 320ms |
| `.anim-float` | 로고·시대 배너·우승 별 둥실 | 5s 무한 |
| `.anim-confetti` | 결과판 축포 조각(`<Confetti>`) | 1.5~2.7s |
| `.anim-rays` / `.anim-track-in` | 시대 전환 빛살 / 시대 이름 글자 모임 | 2.4s / 800ms |
| `.sky::before·::after` | 배경 별 반짝임(4.5s) · 성운 흐름(48s) — `global.css` | 무한 |

### 홈(랜딩) 모션 — `LandingHero.module.css`, `Home.module.css`

CSS Modules 는 모듈 안의 `animation` 이름을 해시로 바꾸므로, 이 둘은 keyframes 를 **모듈 안에** 따로 둔다(전역 `nt-*` 이름을 모듈 CSS 에서 직접 쓰면 해시된 이름이 되어 재생되지 않는다).

| 때(첫 진입) | 요소 | 모션 |
|---|---|---|
| 0–1.8s | 고리 행성 | 지평선 뒤에서 떠오름(`rise`) |
| 0.3–2.5s | 착륙선 | 기울어진 채 하강 → 착지(`land`), 분사 불꽃 깜박임(`flame`) |
| 0.7–2.2s | 로고 | 빛 번짐(blur·밝기) → 정착(`logoIn`), 뒤 호박색 광채(`flare`)·가로 빛줄(`streak`). 바깥 래퍼는 `.anim-float` |
| 1.3s | 태그라인 | `.anim-track-in`(글자 간격 모임) |
| 1.5s~ | 노선 칩·이름·이어 하기·AI 대전·온라인 대전·설명 | `.anim-rise` 80ms 간격 |
| 2.3–3.4s | 착륙지 | 먼지 퍼짐(`dust`) → 불빛(`site`) → 테크 웹 고리 1·2·3·바큇살 그리기(`draw`, stroke-dashoffset) → 노드 톡톡(`pop`) |
| 루프 | 행성 대기 광채 7s · 위성 3기 타원 공전 6–9.5s(뒤로 갈 때 작고 흐림) · 포자 안개 16s · 포자 4개 9–12s · 착륙선 표지등 1.6s · 별똥별 9s · 로고 둥실 5s | |

- 게임에서 홈으로 돌아오면(새로고침 전까지) `--seq: 0.15` 로 시퀀스 전체를 짧게 줄인다.
- 세그먼트(AI 수·인원)는 고른 칸으로 빛 알약이 `transform` 으로 미끄러진다(`--i`).
- 메뉴 패널은 유리질(backdrop-filter) + 노선색(`--tone`) 그라데이션 테두리. 이름 = 방주, AI 대전 = 공생, 온라인 대전 = 합성.
- `prefers-reduced-motion: reduce` 에서는 모두 멈추고 최종 장면(착륙 완료·웹 완성)만 보인다. 별똥별·불꽃·먼지·포자·빛줄은 숨긴다.

- 새로 나타난 것만 움직이려면 `useFresh()`(처음 그릴 때 있던 키는 제외)를 쓴다. 등장 효과(card-in·pop·rise)는 fill `backwards` 라 끝난 뒤 버튼 누름 반응(`button:active` scale)을 막지 않는다.
- 위치를 transform 으로 잡는 버튼은 전역 누름 scale 과 겹치므로 `translate` 속성으로 잡는다.

- 모두 `transform`·`opacity` 만 움직인다(`.anim-glow::after` 의 box-shadow 는 고정, opacity 만 변함).
- 길이·지연은 `--dur`, `--delay` 변수로 덮어쓴다. 같은 클래스를 다시 재생하려면 클래스를 뗐다가 다음 프레임에 붙이거나 `key` 를 바꾼다.
- `prefers-reduced-motion: reduce` 에서는 모두 꺼진다. `.anim-era` 는 정지 상태로 보이므로 코드가 시간이 지나면 닫아야 한다.

## 사용 예

```css
@import "./styles/tokens.css";
@import "./styles/motion.css";

body {
  background: var(--bg) url("./assets/bg-sky.svg") center top / cover no-repeat fixed;
  color: var(--text);
  font-family: var(--font);
}
.resIcon {
  width: 20px; height: 20px;
  background-color: currentColor;
  -webkit-mask: var(--icon) center / contain no-repeat;
          mask: var(--icon) center / contain no-repeat;
}
```

`fixed` 배경은 iOS 에서 무시되므로 필요하면 `position: fixed` 레이어로 깐다.

## 미완성·타협

- 워드마크는 글꼴 없이 직선·원 획으로 그렸다(어떤 기기에서도 같은 모양). 정교한 서체 로고는 아니다.
- 카드별 일러스트는 `src/ui/assets/art/<카드 id>.svg` 134장(규칙은 `docs/art-cards.md`). 묶음별 Claude Design 캔버스: 후원자·유산 https://claude.ai/artifact/5SKiNZWKm9qxUPQGZtGGNN · 자원 팟 https://claude.ai/artifact/AZsnAoY88Ekh7RvPQE93Hf · 1·2시대 퀘스트 https://claude.ai/artifact/VwsHSrJ68MVFDsB9oiqqWU · 3시대·결실·후원 계약 https://claude.ai/artifact/Xg7SY9mAJWDzcGnBebnEpH · 위성·특수 시설 https://claude.ai/artifact/RpCD7cKqhpVY3aKrZUmxXc
- 아이콘 34종은 1.8px 획 한 벌만 있다(채움형 변형 없음).
