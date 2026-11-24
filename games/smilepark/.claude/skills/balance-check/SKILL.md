---
name: balance-check
description: 시설/이벤트 카드 수치의 밸런스 점검 리포트를 생성한다. 카드 수치 변경 후 사용.
---
`balance-analyst` 에이전트로 `notes/놀이공원_v1.xlsx`(또는 지정된 카드 파일)를 분석한다.
유형별 통계, 비용 대비 효율 상·하위 5개, 이상치, 오타/중복 특수효과를 표로 요약하고 수정 제안을 제시한다.
리포트는 `docs/balance-report.md`에 저장한다.
