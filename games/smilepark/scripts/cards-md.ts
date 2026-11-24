/**
 * 카드 목록 문서 생성: npx tsx scripts/cards-md.ts > docs/cards.md
 * 카드 인쇄값(data/cards.ts)·관객 그룹(data/groups.ts)·운영카드(data/events.ts)에서 만든다.
 */
import { CARDS, PRINT } from '../src/game/data/cards';
import { GROUPS } from '../src/game/data/groups';
import { EVENTS, TAG_LABEL } from '../src/game/data/events';

const T = { child: '어린이', adult: '성인', all: '모두' } as const;
const out: string[] = [];
out.push('# 카드 목록 (v1 인쇄값)', '');
out.push('> 자동 생성: `npx tsx scripts/cards-md.ts > docs/cards.md`. 규칙은 `docs/design-v1.md`.', '');
out.push('원본 수치(notes/놀이공원_v1.xlsx)를 아래 규칙으로 한 번 변환한 "카드에 인쇄되는 값"이다(`src/game/data/cards.ts`의 `PRINT`).', '');
out.push(`- 건설비 = 원본 건설비(최소 $${PRINT.minCost}), 유지비 = 원본 그대로`);
out.push(`- 놀이기구 정원 = 원본 건설비 ${PRINT.capTiers.map(([m, c]) => `${m} 이상 ${c}명`).join(', ')}, 그 외 ${PRINT.rideCapMin}명`);
out.push(`- 놀이기구 대상 = 원본 어린이/성인 만족도 차이가 ${PRINT.targetGap} 이상이면 그쪽 전용, 아니면 모두`);
out.push(`- 1명당 만족도 = 전용 ${PRINT.satTargeted}, 모두 ${PRINT.satAll}`);
out.push(`- 상점 수익 = 입장 그룹 1개당 $${PRINT.shopIncome}`, '');

out.push('## 놀이기구 (30장)', '', '| # | 이름 | 유형 | 야외 | 건설비 | 유지비 | 정원 | 대상 | 1명당 만족도 | 특수효과 |', '|---|---|---|---|---|---|---|---|---|---|');
for (const c of CARDS.filter((c) => c.kind === 'ride')) out.push(`| ${c.id} | ${c.name} | ${c.type} | ${c.outdoor ? '야외' : '실내'} | $${c.cost} | $${c.upkeep} | ${c.cap} | ${T[c.target]} | ${c.sat} | ${c.fx.text} |`);
out.push('', '## 상점 (5장)', '', '| # | 이름 | 건설비 | 유지비 | 수익 | 특수효과 |', '|---|---|---|---|---|---|');
for (const c of CARDS.filter((c) => c.kind === 'shop')) out.push(`| ${c.id} | ${c.name} | $${c.cost} | $${c.upkeep} | 그룹당 $${c.income} | ${c.fx.text} |`);
out.push('', '## 부대시설 (15장)', '', '| # | 이름 | 건설비 | 유지비 | 효과 (매 라운드) |', '|---|---|---|---|---|');
for (const c of CARDS.filter((c) => c.kind === 'amenity')) out.push(`| ${c.id} | ${c.name} | $${c.cost} | $${c.upkeep} | ${c.fx.text} |`);

out.push('', '## 관객 그룹 (28장)', '', '| # | 이름 | 어린이 | 성인 | 인원 | 지불 한도 | 취향 |', '|---|---|---|---|---|---|---|');
for (const g of GROUPS) out.push(`| ${g.id} | ${g.name} | ${g.kids} | ${g.adults} | ${g.kids + g.adults} | $${g.budget} | ${g.fav} |`);

out.push('', '## 운영카드 (16장)', '', '| # | 이름 | 아이콘 | 효과 |', '|---|---|---|---|');
for (const e of EVENTS) out.push(`| ${e.id} | ${e.name} | ${e.tags.map((t) => TAG_LABEL[t]).join('·') || '-'} | ${e.desc} |`);
console.log(out.join('\n'));
