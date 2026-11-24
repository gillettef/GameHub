/**
 * 카드 일러스트 (인라인 SVG). 엔진 데이터(id·포지션·특성)를 읽어 카드마다 다른 그림을 만든다.
 * 스타일: 평면 선화 · 축구 × 첩보. 색은 클래스(.art .l 등)로 main.css 의 --a* 토큰을 따른다.
 * 외부 이미지·폰트 없음. 데이터는 읽기만 한다.
 */
import { GOALS, CLUBS, NEEDS, PLAYERS } from '../../core';
import type { Demand, EventKey, Position, Trait } from '../../core';

type Pt = [number, number];
interface Pose {
  head: Pt;
  sh: [Pt, Pt];
  wa: [Pt, Pt];
  arms: [Pt[], Pt[]];
  legs: [Pt[], Pt[]];
  ball?: Pt;
  gloves?: boolean;
}

/** 포지션별 자세 (64×64): FW 슈팅, MF 드리블, DF 막아서기, GK 두 손 들기 */
const POSES: Record<Position, Pose> = {
  FW: { head: [30, 14], sh: [[25, 20], [35, 20]], wa: [[26, 33], [33, 33]], arms: [[[25, 21], [19, 26], [16, 22]], [[35, 21], [40, 26], [44, 24]]], legs: [[[28, 33], [26, 44], [25, 55]], [[31, 33], [38, 40], [45, 38]]], ball: [49, 39] },
  MF: { head: [32, 13], sh: [[27, 19], [37, 19]], wa: [[28, 32], [36, 32]], arms: [[[27, 20], [22, 27], [20, 31]], [[37, 20], [42, 26], [45, 29]]], legs: [[[30, 32], [27, 43], [23, 53]], [[34, 32], [37, 43], [36, 54]]], ball: [42, 53] },
  DF: { head: [32, 15], sh: [[26, 21], [38, 21]], wa: [[27, 34], [37, 34]], arms: [[[26, 22], [19, 28], [14, 31]], [[38, 22], [45, 28], [50, 31]]], legs: [[[29, 34], [23, 44], [20, 55]], [[35, 34], [41, 44], [44, 55]]] },
  GK: { head: [32, 17], sh: [[27, 23], [37, 23]], wa: [[28, 36], [36, 36]], arms: [[[27, 23], [22, 15], [20, 8]], [[37, 23], [42, 15], [44, 8]]], legs: [[[30, 36], [27, 46], [25, 55]], [[34, 36], [37, 46], [39, 55]]], gloves: true, ball: [32, 6] },
};

/** 포지션 색 (유니폼 바탕 · 강조) */
const SHIRT: Record<Position, string> = { FW: '#5a4543', MF: '#3a4f5e', DF: '#425246', GK: '#59513d' };
export const POS_ACCENT: Record<Position, string> = { FW: '#c9958a', MF: '#8fb0c6', DF: '#98b496', GK: '#c4b07e' };

const pts = (p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ');
const lerp = (a: Pt, b: Pt, t: number): Pt => [+(a[0] + (b[0] - a[0]) * t).toFixed(1), +(a[1] + (b[1] - a[1]) * t).toFixed(1)];

function starPts(cx: number, cy: number, R: number, r: number, n = 5): string {
  const out: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI / n) * i - Math.PI / 2;
    const d = i % 2 ? r : R;
    out.push(`${(cx + Math.cos(a) * d).toFixed(1)},${(cy + Math.sin(a) * d).toFixed(1)}`);
  }
  return out.join(' ');
}

/** 특성 기호 (10×10) */
const TRAIT_GLYPH: Record<Trait, string> = {
  스타: `<polygon class="gf" points="${starPts(5, 5.3, 5, 2.1)}"/>`,
  플레이메이커: '<path class="a d" d="M1 8.5Q5 0 9 4"/><path class="a" d="M6.6 2.6 9 4 7.4 6.2"/>',
  베테랑: '<path class="a" d="M1 5 5 2l4 3M1 8.5l4-3 4 3"/>',
  유망주: '<path class="a" d="M5 10V4.5M5 6.5Q1 6.5 1 2.5 5 2.5 5 6.5M5 5.2Q9 5.2 9 1.2 5 1.2 5 5.2"/>',
  클린시트: '<path class="a" d="M5 1l4 1.5v3C9 8 7 9.3 5 10 3 9.3 1 8 1 5.5v-3z"/><path class="a" d="m3.3 5.6 1.3 1.3L7 4.2"/>',
  멀티플레이어: '<path class="a" d="M5 1v8M1 5h8M3.5 2.5 5 1l1.5 1.5M3.5 7.5 5 9l1.5-1.5M2.5 3.5 1 5l1.5 1.5M7.5 3.5 9 5 7.5 6.5"/>',
};
export const traitGlyph = (t: Trait, x: number, y: number, s = 1): string => `<g transform="translate(${x} ${y}) scale(${s})">${TRAIT_GLYPH[t]}</g>`;

const ball = ([x, y]: Pt, r = 3.4): string =>
  `<circle class="bl" cx="${x}" cy="${y}" r="${r}"/><polygon class="k" points="${starPts(x, y, r * 0.45, r * 0.45, 5).split(' ').filter((_, i) => i % 2 === 0).join(' ')}"/>`;

function hair(kind: number, [x, y]: Pt): string {
  switch (kind) {
    case 1:
      return `<path class="h" d="M${x - 4.6} ${y - 0.8}Q${x} ${y - 7.5} ${x + 4.6} ${y - 0.8}Q${x} ${y - 3.6} ${x - 4.6} ${y - 0.8}Z"/>`;
    case 2:
      return `<path class="h" d="M${x - 4.5} ${y - 1}L${x - 3.5} ${y - 6}L${x - 1.5} ${y - 3.8}L${x} ${y - 7}L${x + 1.5} ${y - 3.8}L${x + 3.5} ${y - 6}L${x + 4.5} ${y - 1}Z"/>`;
    case 3:
      return `<path class="h" d="M${x - 4.6} ${y}Q${x - 5} ${y - 6.5} ${x} ${y - 5.8}Q${x + 5} ${y - 6.5} ${x + 4.6} ${y}L${x + 5.4} ${y + 5}L${x + 3} ${y + 1.6}Q${x} ${y - 3} ${x - 4.6} ${y}Z"/>`;
    default:
      return '';
  }
}

/** 선수 몸 (자세 · 유니폼 무늬 · 머리 모양) */
function figure(pos: Position, pattern: number, hairKind: number, withBall = true): string {
  const p = POSES[pos];
  const [s0, s1] = p.sh;
  const [w0, w1] = p.wa;
  const limbs = [...p.legs, ...p.arms].map((l) => `<polyline class="w" points="${pts(l)}"/>`).join('');
  let deco = '';
  if (pattern === 1) deco = [1 / 3, 2 / 3].map((t) => `<path class="lt" d="M${lerp(s0, s1, t).join(' ')}L${lerp(w0, w1, t).join(' ')}"/>`).join('');
  if (pattern === 2) deco = `<path class="sash" d="M${s0.join(' ')}L${w1.join(' ')}"/>`;
  const gloves = p.gloves ? p.arms.map((a) => `<circle class="gl" cx="${a[2]![0]}" cy="${a[2]![1]}" r="2.6"/>`).join('') : '';
  return `${limbs}<polygon class="s" points="${pts([s0, s1, w1, w0])}"/>${deco}<circle class="b" cx="${p.head[0]}" cy="${p.head[1]}" r="4.5"/>${hair(hairKind, p.head)}${gloves}${p.ball && withBall ? ball(p.ball) : ''}`;
}

const CORNERS = '<path class="lt" d="M3 9V3h6M55 3h6v6M61 55v6h-6M9 61H3v-6"/>';

/** 선수 카드 일러스트: 자세 = 포지션, 기호 = 특성, 무늬·머리·방향·등번호 = 선수마다 */
export function playerArt(id: number): string {
  const p = PLAYERS[id];
  if (!p) return '';
  const pattern = id % 3;
  const hairKind = Math.floor(id / 3) % 4;
  const mirror = Math.floor(id / 12) % 2 === 1;
  const num = ((id * 17) % 97) + 1;
  const body = figure(p.pos, pattern, hairKind);
  return `<svg class="art" viewBox="0 0 64 64" style="--as:${SHIRT[p.pos]};--aa:${POS_ACCENT[p.pos]}" role="img" aria-label="${p.name} 일러스트 (${p.pos} · ${p.trait})">
<ellipse class="g" cx="32" cy="57" rx="16" ry="2.4"/>${CORNERS}<g${mirror ? ' transform="matrix(-1 0 0 1 64 0)"' : ''}>${body}</g>${traitGlyph(p.trait, 6, 6, 1.1)}<text class="t" x="59" y="60" text-anchor="end">${num}</text></svg>`;
}

// ── 구단 ──────────────────────────────────────────────

const SHIELDS = [
  '<path class="c" d="M24 4 42 9v13c0 11-8 18-18 22C14 40 6 33 6 22V9z"/>',
  '<circle class="c" cx="24" cy="24" r="19"/><circle class="lt d" cx="24" cy="24" r="15.5"/>',
  '<path class="c" d="M24 4 41 13v20L24 43 7 33V13z"/>',
];

/** 구단 상징 (12곳, 구단 id 순) */
const CLUB_SYM = [
  // 블루 드래곤즈: 용
  '<path class="l" d="M11 31c4-6 8 2 13-3s7-7 11-9"/><path class="l" d="m35 19 5-3-1 4zM36 18l-1-4M38 17l1-4M17 28l1-3M22 30l1-3M28 24l1-3"/>',
  // 실버 호크스: 매
  '<path class="l" d="M8 20c6 2 11 5 16 10 5-5 10-8 16-10-5 6-10 10-16 14-6-4-11-8-16-14z"/><path class="l" d="M24 30v-7l2 2"/>',
  // 아이언 가디언즈: 성탑
  '<path class="l" d="M15 34V20h3v3h3v-3h6v3h3v-3h3v14z"/><path class="l" d="M22 34v-5a2 2 0 0 1 4 0v5"/>',
  // 에메랄드 타이거즈: 호랑이
  '<path class="l" d="m14 18 4-6 3 5c2-1 4-1 6 0l3-5 4 6c2 4 1 12-10 17-11-5-12-13-10-17z"/><path class="l" d="m20 22 2 2M28 22l-2 2M24 19v4M19.5 26h2M26.5 26h2M23 30h2l-1 1.5z"/>',
  // 오로라 FC: 오로라
  '<path class="l" d="M10 30c6-8 12 2 18-6s8-4 10-2M10 25c6-8 12 2 18-6s8-4 10-2M10 35c6-8 12 2 18-6s8-4 10-2"/>',
  // 노바 크루저스: 신성(별 폭발)
  `<polygon class="l" points="${starPts(24, 24, 12, 4.5, 8)}"/><circle class="l" cx="24" cy="24" r="2"/>`,
  // 썬더 울브스: 늑대 + 번개
  '<path class="l" d="m16 16 3-5 3 5h4l3-5 3 5 1 8-9 10-9-10z"/><path class="l" d="m27 19-4 6h4l-4 6"/>',
  // 스톰 파이오니어: 폭풍 구름 + 깃발
  '<path class="l" d="M14 25a5 5 0 0 1 5-6 6 6 0 0 1 11 1 4.5 4.5 0 0 1 2 9H16a4 4 0 0 1-2-4z"/><path class="l" d="M24 29v10M24 31l6 2-6 2M17 32l-1 3M31 32l-1 3"/>',
  // 레드 피닉스: 불사조
  '<path class="l" d="M24 34c-8-4-12-12-10-20 4 6 6 8 10 10 4-2 6-4 10-10 2 8-2 16-10 20z"/><path class="l" d="M24 24v-8a2 2 0 0 1 2 2M21 34l3 5 3-5"/>',
  // 골든 이글스: 독수리 옆얼굴
  '<path class="l" d="M14 31c0-10 6-16 14-16 5 0 8 3 9 6l-5 2c-2-1-4 0-5 2-1 4-3 7-7 9z"/><circle class="l" cx="29" cy="19" r="1"/>',
  // 퍼플 나이츠: 기사(체스 나이트)
  '<path class="l" d="M17 36h14l-1-4c0-6-2-10-2-14l-4-6-1 3c-4 1-7 5-8 9l3 1 3-2 2 1c-2 3-5 6-5 12z"/>',
  // 화이트 샤크스: 상어 지느러미 + 파도
  '<path class="l" d="M14 30c6-2 10-10 12-18 2 8 5 14 9 18z"/><path class="l" d="M8 34q4-3 8 0t8 0 8 0 8 0"/>',
];
export const CLUB_TINT = ['#5a7398', '#848d9b', '#727985', '#5a8574', '#5f8c8c', '#7c7194', '#8c8160', '#62748a', '#8e6262', '#998660', '#71628c', '#9aa2ad'];

const clubBody = (id: number): string => `${SHIELDS[id % SHIELDS.length]}${CLUB_SYM[id] ?? ''}`;

/** 구단 엠블럼: 방패 모양 3종 × 구단 상징 12종, 구단 색은 낮은 채도 */
export function clubArt(id: number): string {
  const c = CLUBS[id];
  if (!c) return '';
  return `<svg class="art" viewBox="0 0 48 48" style="--ac:${CLUB_TINT[id]}" role="img" aria-label="${c.name} 엠블럼">${clubBody(id)}</svg>`;
}

/** 구단 요구 카드: 축구장 위 필요 포지션 구역 + 선호 특성 기호, 테두리 = 구단 색 */
export function needArt(needId: number): string {
  const n = NEEDS[needId];
  if (!n) return '';
  const zone: Record<Position, string> = {
    FW: '<rect class="zf" x="5" y="10" width="30" height="10" rx="1"/>',
    MF: '<rect class="zf" x="5" y="21" width="30" height="10" rx="1"/>',
    DF: '<rect class="zf" x="5" y="32" width="30" height="9" rx="1"/>',
    GK: '<rect class="zf" x="12" y="42" width="16" height="6" rx="1"/>',
  };
  return `<svg class="art" viewBox="0 0 40 52" style="--ac:${CLUB_TINT[n.club]};--aa:${POS_ACCENT[n.pos]}" role="img" aria-label="${CLUBS[n.club]!.name} 요구 카드: ${n.pos} 필요 · ${n.pref} 선호">
<rect class="c" x="3" y="3" width="34" height="46" rx="3"/>${zone[n.pos]}<path class="lt" d="M3 26h34M12 3v6h16V3M12 49v-6h16v6"/><circle class="lt" cx="20" cy="26" r="5"/>${traitGlyph(n.pref, 15, 21, 1)}</svg>`;
}

/** 목표 카드: 의뢰서(클립보드) + 과녁 + 조건 표시 (포지션 색, 특성 문양) */
export function goalArt(goalId: number): string {
  const g = GOALS[goalId];
  const r = g?.rule;
  const accent = r?.kind === 'pos' ? POS_ACCENT[r.pos] : '#c4b07e';
  const mark =
    r?.kind === 'trait'
      ? traitGlyph(r.trait, 19, 33, 1)
      : r?.kind === 'pos'
        ? `<text class="t" x="24" y="40" text-anchor="middle">${r.pos}</text>`
        : r?.kind === 'cost'
          ? '<text class="t" x="24" y="40" text-anchor="middle">6억+</text>'
          : '<text class="t" x="24" y="40" text-anchor="middle">4/4</text>';
  return `<svg class="art" viewBox="0 0 48 48" style="--aa:${accent}" role="img" aria-label="목표 카드 일러스트${g ? ` (${g.name})` : ''}">
<ellipse class="g" cx="24" cy="46" rx="15" ry="1.8"/><rect class="s" x="10" y="6" width="28" height="38" rx="3"/><path class="l" d="M18 6V3.5h12V6"/><circle class="a" cx="24" cy="20" r="8"/><circle class="a" cx="24" cy="20" r="4"/><circle class="af" cx="24" cy="20" r="1.4"/><path class="lt" d="M14 28h20"/>${mark}</svg>`;
}

// ── 요구 수수료 카드 ─────────────────────────────────

/** 서류 가방 + 동전 탑 (카드가 높을수록 동전이 많다) */
export function demandArt(d: Demand): string {
  const coins = Array.from({ length: d }, (_, k) => `<ellipse class="coin" cx="38" cy="${40 - k * 4.4}" rx="6" ry="2.3"/>`).join('');
  return `<svg class="art" viewBox="0 0 48 48" role="img" aria-label="요구 수수료 카드 ${d}단계 일러스트">
<ellipse class="g" cx="24" cy="44" rx="18" ry="1.8"/><rect class="s" x="5" y="22" width="26" height="19" rx="3"/><path class="l" d="M13 22v-4h10v4M5 30h26M18 28v4"/>${coins}</svg>`;
}

// ── 이벤트 ───────────────────────────────────────────

const EVENT_TINT: Record<EventKey, string> = {
  normal: '#8f9db1', fw: '#c9958a', defense: '#98b496', young: '#98b496', budget: '#b9a07a',
  big: '#c4b07e', sponsor: '#a59cc0', overseas: '#8fb0c6', deadline: '#c9958a',
};

const person = (x: number) => `<circle class="b" cx="${x}" cy="20" r="4"/><path class="s" d="M${x - 6} 27h12l1 14H${x - 7}z"/><path class="w" d="M${x - 3} 41v8M${x + 3} 41v8"/>`;

const SCENES: Record<EventKey, string> = {
  normal: `<rect class="p" x="14" y="8" width="44" height="38" rx="2"/><path class="w2" d="M19 15h26"/><path class="lt" d="M19 22h34M19 27h20M19 32h20M19 37h28"/><rect class="lt" x="43" y="26" width="10" height="9"/>${ball([74, 38], 8)}`,
  fw: `<g transform="translate(2 4) scale(.75)">${figure('FW', 0, 1, false)}</g><path class="a" d="M52 30h8M50 36h10M54 42h6"/><path class="af" d="M64 38c1-7 6-6 7-12 3 5 7 6 8 12 1 6-3 10-8 10s-8-4-7-10z" opacity=".35"/>${ball([71, 39], 6)}`,
  defense: `${person(24)}${person(39)}${person(54)}<path class="s" d="M70 32V21a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v13c0 5-3 8-7 8s-7-3-7-8z"/>`,
  young: `${ball([36, 41], 8)}<path class="a" d="M36 33V19M36 25q-8 0-9-8 8 0 9 8M36 22q8 0 9-9-8 0-9 9"/><circle class="lt" cx="74" cy="15" r="6"/><path class="lt" d="M74 5v3M74 22v3M64 15h3M81 15h3M67 8l2 2M79 20l2 2"/>`,
  budget: `<path class="s" d="M16 48V18h9v30zM30 48V26h9v22zM44 48V33h9v15zM58 48V39h9v9z"/><path class="a" d="M14 12l18 8 12-2 22 16"/><path class="a" d="M60 34h6v-6"/><circle class="lt" cx="82" cy="16" r="7"/><path class="lt" d="M79 16h6"/>`,
  big: `<rect class="s" x="16" y="22" width="40" height="26" rx="3"/><path class="l" d="M29 22v-5h14v5M16 32h40M36 30v5"/>${[0, 1, 2, 3, 4].map((k) => `<ellipse class="coin" cx="70" cy="${46 - k * 4.4}" rx="7" ry="2.5"/>`).join('')}${[0, 1, 2].map((k) => `<ellipse class="coin" cx="84" cy="${46 - k * 4.4}" rx="6" ry="2.2"/>`).join('')}<polygon class="gf" points="${starPts(80, 14, 5, 1.6, 4)}"/>`,
  sponsor: `<path class="cone" d="M48 4 30 50h36z"/><path class="l" d="M48 50V31M40 50h16"/><rect class="s" x="44" y="18" width="8" height="13" rx="4"/><path class="lt" d="M14 14l4 4M18 14l-4 4M78 10l4 4M82 10l-4 4M12 38h10M74 34h10"/>`,
  overseas: `<path class="lt" d="M10 42a6 6 0 0 1 10-4 7 7 0 0 1 13 2 5 5 0 0 1-1 9H12a5 5 0 0 1-2-7zM64 20a5 5 0 0 1 8-3 6 6 0 0 1 11 2 4 4 0 0 1-1 8H66a4 4 0 0 1-2-7z"/><path class="s" d="M30 22 66 14l8-2c4-1 6 1 3 3l-9 5-12 16h-5l5-14-16 4-5 5h-4l3-7z"/><path class="a" d="M8 53h8M22 53h8M36 53h8M50 53h8M64 53h8M78 53h8"/>`,
  deadline: `<circle class="s" cx="40" cy="28" r="18"/><path class="lt" d="M40 12v3M40 41v3M24 28h3M53 28h3"/><path class="l" d="M40 28V16M40 28l9 4M26 12l-4-4M54 12l4-4"/><path class="p" d="m66 14 14-3 3 14-14 3z"/><path class="lt" d="m69 18 9-2M70 22l9-2"/><path class="p" d="m70 34 13 2-2 13-13-2z"/><path class="lt" d="m72 39 8 1M71 43l8 1"/>`,
};

/** 이벤트 카드 장면 (96×56) */
export function eventArt(k: EventKey, label = ''): string {
  return `<svg class="art" viewBox="0 0 96 56" style="--aa:${EVENT_TINT[k]};--as:#25324a" role="img" aria-label="${label || k} 장면"><path class="lt" d="M4 52h88"/>${SCENES[k]}</svg>`;
}
