# 2027 코리아보드게임즈 보드게임 공모전 제출물

- **마감:** 2026-12-31 24시. 이메일(game@koreaboardgames.com) 또는 같은 날 소인 우편.
- **1차(서류):** 신청서 + 기획안(A4 2쪽 이내, 2쪽에 진행 사진 1~2장) + 규칙서(.pdf/.doc/.ppt/.hwp).
- **2차(현장 플레이):** 실물 프로토타입 지참. 1차 발표 2027-03-08.
- **응모 분야:** 기타 게임(특별한 기물·물리적 구조물) 권장. 패밀리 게임은 최대 인원 4명 이상이 조건이라 해당하지 않는다.

## 파일

| 파일 | 내용 | 만드는 법 |
|---|---|---|
| `LASTGRAIN_기획안.docx` | 공식 양식에 채운 기획안 (A4 2쪽) | `python submission/fill_proposal.py "작가명"` |
| `LASTGRAIN_규칙서.pdf` / `.html` | 제출용 규칙서 (`rules/rulebook.md`에서 생성) | `python submission/build_rulebook.py` |
| `figures/fig1-board.png`, `fig2-flip.png` | 기획안 2쪽 진행 모습 그림 | `python submission/figures/make_figures.py` 후 Chrome으로 PNG 캡처 (아래) |
| `figures/fig3-layout.svg` | 규칙서용 보드 배치도 | `make_figures.py` |
| `proposal.md` | 기획안 원문(긴 버전). docx는 이 글의 압축본이다 | 손으로 쓴다 |
| `forms/` | 공식 양식 원본 (기획안, 신청서) | 공지 첨부파일 |

PNG 캡처:
```
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"; cd submission/figures; P=$(pwd -W)
"$CH" --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=1500,1000 --screenshot="$P/fig1-board.png" "file:///$P/fig1-board.html"
"$CH" --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=1500,560 --screenshot="$P/fig2-flip.png" "file:///$P/fig2-flip.html"
```

**규칙을 고치면** `build_rulebook.py`를 다시 돌린다. 수치가 바뀌면 `fill_proposal.py`의 문장과 `proposal.md`도 고친다.

## 제출 전 체크리스트

- [ ] 실물 프로토타입으로 플레이테스트하고, 그 결과로 수치를 확정한다(대모래시계 20분, 목표 25점, 후 플레이어 2점은 가안).
- [ ] 게임을 모르는 사람에게 규칙서만 읽혀서 한 판을 진행해 본다(공지 권장 사항).
- [ ] 실물 사진을 찍으면 기획안 2쪽 그림을 사진으로 바꾼다. 그림만 내도 공지상 허용된다.
- [ ] `fill_proposal.py`에 작가명을 넣어 다시 만들고, **Word로 열어 2쪽인지 확인한다**(LibreOffice로만 검증했다).
- [ ] 신청서(`forms/공모전신청서양식.docx`): 응모 분야, 작가 정보, 개인정보 동의, **자필 서명**을 넣고 스캔하거나 서명 파일로 만든다.
- [ ] 규칙서 PDF 첫 쪽 버전 표기를 확인한다.
- [ ] 메일로 신청서, 기획안, 규칙서 세 파일을 보낸다.
