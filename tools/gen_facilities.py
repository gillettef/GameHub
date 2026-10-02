"""notes/놀이공원_v1.xlsx 시설 카드 -> src/game/data/facilities.ts 생성. (python tools/gen_facilities.py)"""
import json, openpyxl
wb = openpyxl.load_workbook('notes/놀이공원_v1.xlsx', data_only=True)
rows = [r for r in list(wb['시설 카드'].iter_rows(values_only=True))[2:] if r[0] is not None]
items = [dict(id=int(r[0]), type=r[1], name=r[2], cost=int(r[3]), upkeep=int(r[4]),
              income=[int(r[5]), int(r[6])], sat=[int(r[7]), int(r[8])], effect=(r[9] or '').strip()) for r in rows]
out = "// 자동 생성: tools/gen_facilities.py (원본 notes/놀이공원_v1.xlsx)\nimport type { FacilityCard } from '../types';\n\n"
out += "export const FACILITIES: FacilityCard[] = " + json.dumps(items, ensure_ascii=False, indent=2) + ";\n\n"
out += "export const FACILITY_BY_ID: Record<number, FacilityCard> = Object.fromEntries(FACILITIES.map((c) => [c.id, c]));\n"
open('src/game/data/facilities.ts', 'w', encoding='utf-8').write(out)
print(len(items), 'cards')
