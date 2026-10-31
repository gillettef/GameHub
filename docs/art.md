# 네오테라 아트 키트

행성의 밤하늘, 포자 안개, 토착 생물, 궤도 위성을 바탕으로 한 다크 테마 시각 자산. 모두 직접 설계한 벡터(SVG)이며 래스터 이미지와 웹폰트는 쓰지 않는다.

- Claude Design 캔버스(디자인 확인용, 비공개): https://claude.ai/artifact/34UtDyLuoFUUSyCgUrpeHh
  - 아트보드: 토큰·로고·배경 / 아이콘 32종 / 카드 프레임 13종 / 노선 문장·시대 배너·모션
- **정본은 이 저장소의 파일**이다. 캔버스를 고쳤으면 해당 SVG/CSS 도 같이 고친다.

## 파일 목록

| 경로 | 내용 |
|---|---|
| `src/ui/styles/tokens.css` | `:root` 색·간격·모양·글꼴·그림자 변수 |
| `src/ui/styles/motion.css` | keyframes 와 `.anim-*` 유틸 클래스 |
| `src/ui/assets/bg-sky.svg` | 앱 배경. viewBox 430×932, `preserveAspectRatio="xMidYMid slice"` |
| `src/ui/assets/logo.svg` | 심볼(고리 행성 + 새싹 + 세 노선 위성) + 기하학 획 워드마크 "네오테라". viewBox 324×96 |
| `src/ui/assets/icons/*.svg` | 24×24 단색 아이콘 32종 |
| `src/ui/assets/cards/*.svg` | 카드 프레임 13종, viewBox 250×350 |
| `src/ui/assets/emblems/{ark,symbiont,synth}.svg` | 노선 문장 120×120 (고정 색) |
| `src/ui/assets/emblems/era{1..4}.svg` | 시대 전환 배너 360×120 (1 착륙 · 2 정착 · 3 궤도 · 4 종료/결실) |

전체 SVG 약 53KB(목표 400KB 이하), 배경 약 8KB.

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

`food prod energy sci culture command defense might health spore ark symbiont synth farm workshop power lab hall guard rider battery flyer satellite quest threat patron mission charter legacy pioneer supply colonist`

- 루트에 `stroke="currentColor" fill="none" stroke-width="1.8"` 가 있어 **인라인 SVG**로 넣으면 부모의 `color` 를 따른다. 예: 자원 칩에서 `color: var(--res-food)`.
- `<img>` 로 쓰면 currentColor 가 검정이 되므로, 색을 입히려면 CSS `mask-image: url(...)` + `background-color: currentColor` 방식을 권장한다(아래 사용 예). `innerHTML` 류로 SVG 문자열을 넣는 방식은 프로젝트 규칙상 쓰지 않는다.
- 24px 기준으로 그렸다. 16px 아래로 줄이지 않는다. 터치 타깃은 아이콘이 아니라 버튼이 44px 를 채운다.

## 카드 프레임

`pioneer legacy supply patron satellite mission quest-back quest-judge quest-threat quest-contest quest-patron quest-fruition quest-finale`

- 글자 없이 테두리·띠·그림 창만 있다. 코드가 위에 글자를 절대 위치로 얹는다(250×350 기준 좌표, 실제 크기에 비례해 환산).
  - 상단 띠 y 8–58: 이름·종류. 왼쪽 비용 원 (31,33) r15 — 선구자·유산·보급·후원 계약·위성. 퀘스트는 오른쪽 표식 칸 (196,18) 32×30, 위협형은 같은 자리 육각(위협도).
  - 그림 창 y 66–188 (선구자·유산은 아치형).
  - 구분선 y 197, 본문 y 205–290.
  - 노선 선택지 칸 y 296–330, x 18·92·166 (폭 66) — 판정형·위협형·경쟁형. 칸 색은 `--ark/--symbiont/--synth`.
  - 유산 단계 마름모 4개 x 228, y 219·243·267·291. 위성 타이머 원 4개 y 318, x 86·112·138·164.
- 테두리·장식색은 **`currentColor`**, 루트 `color` 속성에 종류별 기본색이 들어 있다(선구자 호박, 유산 금, 보급 청동, 판정 하늘, 위협 빨강, 경쟁 주황, 후원 제안 보라, 결실·종료 금, 후원 계약 난초, 위성 연청, 임무 녹색). 인라인으로 넣고 CSS `color` 를 주면 노선색 등으로 바꿀 수 있다(예: 선구자 카드 `color: var(--ark)`).
- 바탕은 `style="fill:var(--surface,#161f38)"` 처럼 토큰을 쓰고 대체값을 둔다. `<img>` 로 써도 대체값으로 같은 모양이 나온다.
- 인라인으로 한 화면에 여러 장 넣을 때: `clipPath` id 가 파일마다 다르게(`ntSupClip`, `ntFinClip`, `ntMisClip`) 지정돼 있어 충돌하지 않는다. 같은 프레임을 여러 장 인라인하면 id 가 중복되지만 내용이 같아 표시에는 문제가 없다.

## 노선 문장·시대 배너

- 문장은 고정 색(그라데이션 포함)이다. 노선 선택 화면, 현황 탭 노선 트랙 머리, 결실 퀘스트 정산에 쓴다.
  - 방주: 육각 방패 + 푸른 지구 기억 + 받치는 선체 / 공생: 곧은 줄기에 감긴 촉수 덩굴 + 포자 빛 / 합성: 팔각 칩 + 회로 + 기계 눈.
- 시대 배너는 가운데(대략 x 90–270)를 비워 두었다. 시대 이름은 코드가 가운데에 얹는다. 테두리 색이 고리색과 맞는다(1 은회, 2 보라, 3 금, 종료 금).
- SVG 안의 gradient id 는 `ntArk*`, `ntSym*`, `ntSyn*`, `ntE1*`~`ntE4*` 접두어로 겹치지 않게 했다.

## 모션 (`motion.css`)

| 클래스 | 쓰임 | 기본 길이 |
|---|---|---|
| `.anim-card-in` | 카드 줄 칸 채움. 칸마다 `style="--delay: 40ms"` 처럼 순차 | 320ms |
| `.anim-flip` | 퀘스트 공개(뒷면 → 앞면). 앞면 요소에 붙이고 부모는 같은 크기 유지 | 520ms |
| `.anim-orbit` | 위성 공전. 궤도 중심 래퍼에 붙이고 위성은 래퍼 안에서 반지름만큼 떨어뜨림 | 14s 무한 |
| `.anim-pulse` | 연구 가능한 테크 웹 노드(SVG `<g>`/`<circle>`에도 동작, `transform-box: fill-box`) | 1.8s 무한 |
| `.anim-hit` | 습격·위협 피격 시 식민지 패널 흔들림 | 420ms |
| `.anim-era` | 시대 전환 오버레이(나타남 → 머묾 → 사라짐). `animationend` 에서 제거 | 2.4s |
| `.anim-glow` | 카드 획득·노선 단계 도달 반짝임(`::after` 광채, `--accent`) | 700ms |

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
- 카드별 일러스트는 `src/ui/assets/art/<카드 id>.svg` 134장(규칙은 `docs/art-cards.md`). 묶음별 Claude Design 캔버스: 선구자·유산 https://claude.ai/artifact/5SKiNZWKm9qxUPQGZtGGNN · 보급 https://claude.ai/artifact/AZsnAoY88Ekh7RvPQE93Hf · 1·2시대 퀘스트 https://claude.ai/artifact/VwsHSrJ68MVFDsB9oiqqWU · 3시대·결실·후원 계약 https://claude.ai/artifact/Xg7SY9mAJWDzcGnBebnEpH · 위성·특수 시설 https://claude.ai/artifact/RpCD7cKqhpVY3aKrZUmxXc
- 아이콘 32종은 1.8px 획 한 벌만 있다(채움형 변형 없음).
