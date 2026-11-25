# 카드 디자인

카드 앞면·뒷면 디자인(SVG)이다. 파일 이름은 `notes/Rules.md` 의 영문 id 그대로 쓴다.
경로는 `src/client/game/cardImages.ts` 가 만들고, 빠진 파일은 `cardImages.test.ts` 가 잡는다.

| 폴더 | 파일 | 크기 | 쓰는 곳 |
|---|---|---|---|
| `plants/` | `<종 id>.svg` 9장 (grass, oak, pine, kudzu, fern, dandelion, lotus, mushroom, mugunghwa) | 630×880 세로 | 확대 모달(앞면 그대로) |
| `plants/art/` | `<종 id>.webp` 9장 | 582×320 | 손패·마켓·카드 탭의 작은 카드 배경. 앞면의 그림 부분(가로 24~606, 세로 150~470)을 잘라 만든 썸네일 |
| `plants/` | `back.svg` | 630×880 | 마켓의 카드 더미 |
| `goals/` | `<목표 id>.svg` 16장 (pond-side … dandelion-reserve) | 880×630 가로 | 목표 칩·점수 탭·카드 탭에서 누르면 확대 모달 |
| `goals/` | `back.svg` | 880×630 | (아직 쓰는 곳 없음) |

- 카드 안의 글자(이름·문구·이야기·점수)는 `notes/Cards.md` 와 같아야 한다. 뿌리 그림·문구·번호·배지는 `node tools/card-text.mjs` 가 `test/fixtures/specs.json` 에서 다시 그린다(2026-10-16). 이야기 문구는 손으로 고친다.
- 오프라인 기본판에서 뺀 카드(담쟁이·대나무·유채, 이어진 정원·경계 지키기)는 `notes/design/expansion-cards/` 에 있다.
- SVG 는 `<img>` 로 띄우므로 안의 Google Fonts `@import` 는 불러오지 않고 시스템 글꼴로 대신 그린다.
- 식물 카드 SVG 를 바꾸면 `node tools/card-thumbs.mjs` 로 `plants/art/` 썸네일을 다시 만든다(Chrome 헤드리스로 자른다). 그림 구도가 바뀌면 스크립트의 `CROP` 을 함께 고친다.
- 원본 SVG 는 필터가 들어 있고 장당 최대 600KB 라서 작은 카드에는 쓰지 않는다. 운영 서버는 `compression` 으로 gzip 해서 보낸다.
