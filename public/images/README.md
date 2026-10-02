# 이미지 에셋 폴더

여기에 이미지를 넣으면 게임에 자동 반영됩니다. (없으면 아이콘 플레이스홀더가 표시됨)

- 경로 규칙: `public/images/<슬롯키>.webp` (또는 `.png`, `.jpg`)
  - 시설 카드: `facility/1.webp` ~ `facility/50.webp`
  - 시설 유형 대체 배경: `type/스릴형.webp` …
  - 인력: `staff/marketer.webp` …
  - 이벤트 배너: `event/1.webp` ~ `event/12.webp`
  - 관객: `visitor/child.webp`, `visitor/adult.webp`
  - 공통: `ui/logo`, `ui/title-bg`, `ui/park-bg`, `ui/slot-empty`, `ui/slot-broken`
- 전체 슬롯 목록과 권장 크기: 앱을 열고 주소 뒤에 `#assets` 를 붙이면 확인할 수 있습니다. (정의: `src/ui/assets.ts`)
- 시설 이미지는 `facility/<id>` 가 없으면 `type/<유형>` 으로 대체됩니다.
