---
name: notes-sync
description: notes/의 xlsx·pptx 내용을 읽어 docs/에 마크다운으로 정리하고 두 자료 간 불일치를 보고한다.
---
1. Python으로 pptx(zipfile+정규식으로 `<a:t>` 추출)와 xlsx(openpyxl, data_only=True)를 읽는다. 한글 출력은 UTF-8로 설정한다.
2. 룰, 구성요소, 카드 목록을 `docs/rules.md`, `docs/cards.md`로 정리한다.
3. v1(xlsx)과 개정(pptx) 규칙 차이를 `docs/diff.md`에 표로 남긴다.
4. notes/ 원본은 수정하지 않는다.
