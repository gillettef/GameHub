import sys, copy
import docx
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

src, dst = sys.argv[1], sys.argv[2]
d = docx.Document(src)
T0, T1, T2 = d.tables

def put(cell, lines, size=8.5, bold_first=False, align=None):
    cell.text = ""
    p = cell.paragraphs[0]
    first = True
    for ln in lines:
        if not first:
            p = cell.add_paragraph()
        first = False
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        if align: p.alignment = align
        # **굵게** 구간 처리
        parts = ln.split("**")
        for i, part in enumerate(parts):
            if not part: continue
            r = p.add_run(part)
            r.font.size = Pt(size)
            r.bold = (i % 2 == 1)

C = WD_ALIGN_PARAGRAPH.CENTER
put(T0.rows[0].cells[1], ["HEARSAY (히어세이)"], 12, align=C)
put(T0.rows[1].cells[1], [""], 11, align=C)
put(T0.rows[3].cells[0], ["45~60분"], 10, align=C)
put(T0.rows[3].cells[1], ["4~6인 (12세 이상)"], 10, align=C)
put(T0.rows[3].cells[2], ["기억, 동시 비공개 선택, 다수결 투표, 협상·블러핑"], 10, align=C)

put(T1.rows[0].cells[1], [
 "글자가 없는 외딴 섬마을. 플레이어는 집안을 대표하는 **이야기꾼**이 되어 계절마다 섬의 땅을 차지하지만, 계절이 지나면 땅의 표시는 주머니 속에 섞여 사라집니다. 마을 회의에서 \"3계절에 강가는 누구 땅이었나?\"라고 물으면 확인할 방법은 아무것도 없습니다. **가장 많은 사람이 증언한 이야기가 마을의 공식 역사가 됩니다.** 그리고 **누구도 자기 집안의 일을 스스로 증언할 수 없습니다.** 내 땅이 역사에 남으려면 남이 기억하고 말해 주어야 합니다. 제목 HEARSAY는 \"전해 들은 말\"이라는 뜻입니다.",
])
put(T1.rows[1].cells[1], [
 "① **점유:** 구역 카드 한 장을 몰래 골라 동시에 공개합니다. 혼자 고른 구역에 땅 타일을 놓고, 겹치면 다툼이 되어 아무도 갖지 못합니다.",
 "② **망각:** 다음 계절에 지난 계절의 땅 타일을 모두 망각 주머니에 넣어 섞습니다. 기록이 **물리적으로 사라집니다.**",
 "③ **회의:** 질문자가 사라진 칸 하나를 묻습니다. 60초 동안 주장하고 거래한 뒤, 모두 증언 토큰 하나를 주먹에 쥐고 동시에 펼칩니다(자기 집안 색 토큰은 없습니다).",
 "④ **공식 역사:** 가장 많은 답이 기록 표지로 고정되고(동점이면 질문자의 답), 그 집안은 땅 점수를, 같은 답을 낸 사람은 평판 1점을 얻습니다. 7계절과 마지막 회의 뒤 최고 점수가 이깁니다.",
])
put(T1.rows[2].cells[1], [
 "• **정말로 사라지는 기억 게임.** 정답을 확인하는 절차가 게임 끝까지 없고, 정답은 오직 합의로 정해집니다.",
 "• **자기 집안은 증언할 수 없다.** 내 땅을 지키려면 남을 설득하고, 남의 땅을 훔치려면 공범이 필요합니다. \"네 땅을 말해 줄 테니 내 땅을 말해 줘\"라는 거래와 배신이 생깁니다.",
 "• **단순한 행동, 깊은 판단.** 토큰 하나를 쥐는 행동이 기억이자 표이자 거래의 대가입니다. 판정은 기계적이라 규칙 다툼이 없고, 구성물은 보드 1장과 카드·타일·토큰뿐입니다.",
])
put(T1.rows[3].cells[1], [
 "\"역사는 승자가 쓴다\"는 말을 테이블 위에서 직접 경험하게 하고 싶었습니다. 사람의 기억은 불완전하고 남의 확신에 쉽게 덧칠됩니다. HEARSAY는 그 불완전함을 놀이로 만듭니다. 기억력이 좋은 사람은 진실의 증인이 되고, 말솜씨가 좋은 사람은 역사를 다시 씁니다. 글자 없는 마을이라는 설정이 메모 금지 규칙을 자연스럽게 설명하고, 망각 주머니에 땅 타일을 쓸어 넣는 순간의 아쉬움이 게임의 긴장을 만듭니다.",
])
put(T2.rows[1].cells[0], ["(여기에 실물 플레이 사진 1~2장을 넣으세요: ① 섬 보드 전경 ② 증언 토큰을 쥔 주먹을 동시에 펼치는 순간)"], 9, align=C)
d.save(dst)
print("saved", dst)
