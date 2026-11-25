/**
 * 종이 프로토타입 인쇄물(A4) 생성: 선수·구단·목표·이벤트 카드, 플레이어 카드, 기록지.
 *   npx tsx scripts/print-kit.ts > docs/print/kit.html   (브라우저에서 열어 인쇄)
 * 데이터는 src/engine/data.ts 에서 직접 읽으므로 규칙 수치와 항상 일치한다.
 */
import { CLUBS, EVENTS, EVENT_POOL, GOALS, NEEDS, PLAYERS, RULES, TOTAL_ROUNDS } from '../src/engine';


const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const COLORS = [
  ['노랑', '#f5c86b'],
  ['초록', '#68d6b0'],
  ['파랑', '#8fb7ff'],
  ['빨강', '#ff9aa4'],
] as const;
const LETTERS = 'ABCDEFGHIJKL';

const playerCards = PLAYERS.map(
  (p) => `<div class="card pl ${p.pos}"><div class="hd"><b>${p.pos}</b><span class="base">${p.base}</span></div>
  <div class="nm">${esc(p.name)}</div><div class="tr">${p.trait}</div><div class="cost">몸값 ${p.cost}억</div>
  <div class="ft">오른쪽 위 숫자 = 기본 수수료 ${p.base}억</div></div>`,
);
const clubCards = CLUBS.map(
  (c) => `<div class="card cl"><div class="hd"><b>⚽ 구단</b><span class="base">${c.budget}</span></div>
  <div class="nm">${esc(c.name)}</div><div class="tr">옆에 이 구단의 요구 카드 3장을 섞어 쌓고 맨 위를 공개</div>
  <div class="ft">제시액 <b>${c.budget}</b>억</div></div>`,
);
const needCards = NEEDS.map(
  (n) => `<div class="card nd"><div class="hd"><b>요구 카드</b><span class="base">${n.pos}</span></div>
  <div class="nm">${esc(CLUBS[n.club]!.name)}</div><div class="tr">${n.pos} 필요 (+2) · ${n.pref} 선호 (+1)</div>
  <div class="ft">이번 라운드에 이 구단에 선수가 계약되면 라운드 끝에 더미 맨 아래로 넣고 다음 카드를 공개</div></div>`,
);
const goalCards = GOALS.map(
  (g) => `<div class="card sc"><div class="hd"><b>🎯 목표 카드</b><span class="base">+${RULES.goalBonus}</span></div><div class="nm">${esc(g.name)}</div>
  <div class="tr">${esc(g.desc)}</div>
  <div class="ft">게임이 끝날 때 내가 직접 계약시킨 선수로<br>조건을 채우면 +${RULES.goalBonus}억 (스폰서 데이 계약은 2명으로 셈)</div></div>`,
);
const eventCards = [...EVENT_POOL, 'deadline' as const].map((k) => {
  const e = EVENTS[k];
  return `<div class="card ev ${k === 'deadline' ? 'dl' : ''}"><div class="hd"><b>이벤트</b><span class="base">${e.icon}</span></div>
  <div class="nm">${esc(e.name)}</div><div class="ft">${esc(e.desc)}</div></div>`;
});
/** 시장 최대: 4인 2N+1 = 9명 + 해외파 귀국 2명 + 여유 1 */
const MARKET_SLOTS = 12;
const agentCards = COLORS.flatMap(([name, color]) => [
  ...[1, 2, 3, 4].flatMap((d) => Array.from({ length: RULES.copies }, () => d)).map((d) => `<div class="card dm" style="--c:${color}"><div class="hd"><b>${name}</b></div><div class="big">+${RULES.fee[d - 1]}억</div><div class="ft">요구 수수료 · 매력도 −${RULES.penalty[d - 1]}</div></div>`),
  ...Array.from({ length: MARKET_SLOTS }, (_, i) => `<div class="card sm" style="--c:${color}"><div class="hd"><b>${name}</b></div><div class="big">${i + 1}</div><div class="ft">선수 지목 (시장 칸)</div></div>`),
  ...Array.from({ length: 6 }, (_, i) => `<div class="card sm" style="--c:${color}"><div class="hd"><b>${name}</b></div><div class="big">${LETTERS[i]}</div><div class="ft">구단 지목 (구단 자리)</div></div>`),
]);

const record = `<section class="sheet"><h2>점수 기록지</h2>
<table><tr><th>라운드</th>${COLORS.map(([n]) => `<th>${n}</th>`).join('')}<th>이벤트</th></tr>
${Array.from({ length: TOTAL_ROUNDS }, (_, i) => `<tr><td>${i + 1}${i === TOTAL_ROUNDS - 1 ? ' (데드라인)' : ''}</td>${COLORS.map(() => '<td></td>').join('')}<td></td></tr>`).join('')}
<tr><td>수수료 합</td>${COLORS.map(() => '<td></td>').join('')}<td></td></tr>
<tr><td>목표 카드 (달성 +${RULES.goalBonus})</td>${COLORS.map(() => '<td></td>').join('')}<td></td></tr>
<tr><td><b>최종</b></td>${COLORS.map(() => '<td></td>').join('')}<td></td></tr></table>
<h3>플레이테스트 메모</h3>
<table class="memo"><tr><td>인원 / 날짜</td><td></td></tr><tr><td>첫 판 설명 시간</td><td></td></tr><tr><td>라운드당 시간</td><td></td></tr>
<tr><td>헷갈린 규칙</td><td></td></tr><tr><td>남의 목표를 읽고 가로챘나</td><td></td></tr><tr><td>일부러 동률을 만든 플레이</td><td></td></tr><tr><td>"한 판 더"?</td><td></td></tr></table></section>`;

const market = `<section class="sheet"><h2>시장 칸 보드</h2><div class="slots">${Array.from({ length: MARKET_SLOTS }, (_, i) => `<div class="slot">${i + 1}</div>`).join('')}</div>
<h2>구단 자리</h2><div class="slots six">${Array.from({ length: 6 }, (_, i) => `<div class="slot">${LETTERS[i]}</div>`).join('')}</div>
<h2>1·2차 제안 자리판 (색마다 1장)</h2><div class="slots"><div class="slot">1차</div><div class="slot">2차</div></div>
</section>`;

const group = (title: string, cards: string[]) => `<h2 class="gt">${title} (${cards.length}장)</h2><div class="grid">${cards.join('')}</div>`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>더블 에이전트 인쇄 키트</title><style>
@page { size: A4; margin: 10mm; }
body { font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif; color: #111; margin: 0; }
.gt { font-size: 14px; margin: 6mm 0 2mm; break-after: avoid; }
.grid { display: grid; grid-template-columns: repeat(3, 63mm); gap: 0; }
.card { width: 63mm; height: 88mm; box-sizing: border-box; border: 0.3mm dashed #999; padding: 4mm; display: flex; flex-direction: column; break-inside: avoid; }
.card .hd { display: flex; justify-content: space-between; font-size: 11px; }
.card .base { font-size: 22px; font-weight: 900; }
.card .nm { font-size: 20px; font-weight: 800; margin-top: 8mm; }
.card .tr { font-size: 12px; margin-top: 2mm; color: #333; }
.card .cost { font-size: 18px; font-weight: 800; margin-top: 6mm; }
.card .ft { margin-top: auto; font-size: 11px; line-height: 1.4; }
.pl.FW .hd b { color: #c0392b; } .pl.MF .hd b { color: #2471a3; } .pl.DF .hd b { color: #1e8449; } .pl.GK .hd b { color: #b9770e; }
.sc { background: #fdf6e3; } .nd { background: #eef7f1; } .ev { background: #f4f6fb; } .ev.dl { background: #fde2e2; }
.dm, .sm { border-left: 4mm solid var(--c); }
.dm .big, .sm .big { font-size: 40px; font-weight: 900; text-align: center; margin-top: 10mm; }
.sm { height: 44mm; } .sm .big { margin-top: 1mm; font-size: 28px; }
.sheet { break-before: page; }
table { border-collapse: collapse; width: 100%; margin-bottom: 6mm; font-size: 12px; }
td, th { border: 0.3mm solid #555; padding: 2.5mm; text-align: center; }
.memo td:first-child { width: 45mm; text-align: left; } .memo td { height: 9mm; }
.slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; } .slots.six { grid-template-columns: repeat(3, 1fr); }
.slot { border: 0.4mm solid #333; height: 92mm; display: flex; align-items: flex-start; justify-content: center; font-size: 22px; font-weight: 900; padding-top: 2mm; }
.slots .slot { height: 60mm; }
</style></head><body>
<h1>더블 에이전트 — 종이 프로토타입</h1>
<p>점선을 따라 자르세요. 규칙은 docs/rulebook.md. 선수·구단·이벤트 수치는 엔진(src/engine/data.ts)에서 생성되었습니다.</p>
${group('선수 카드', playerCards)}
${group('구단 카드', clubCards)}
${group('구단 요구 카드', needCards)}
${group('목표 카드', goalCards)}
${group('이벤트 카드', eventCards)}
${group(`플레이어 카드 (요구 수수료 ${4 * RULES.copies} · 선수 지목 ${MARKET_SLOTS} · 구단 지목 6 × 4색)`, agentCards)}
${market}
${record}
</body></html>`;

console.log(html);
