/**
 * 「냥냥 골목」 공모전 제출물 그림(골목 조각·명당 타일·고양이 토큰) SVG. 실물 부품을 위에서 내려다본 모습이다.
 * 좌표: 축 좌표 (q, r), 꼭짓점이 위인 육각. 방향 0 = 동쪽, 1 = 북동 … (src/engine/board.ts DIRECTIONS).
 * 규칙 데이터의 id(grass·oak…)는 엔진 그대로 쓰고, 이름·그림만 고양이 테마로 바꾼다(submission/rulebook.md 대응표).
 */
const SQ3 = Math.sqrt(3);
const FONT = `Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;

/** 세 무리: 치즈냥 · 턱시도냥 · 고등어냥 */
export const SEAT = ['#f29a2e', '#2f2f35', '#6f8fb0'];
export const SEAT_DARK = ['#b8661a', '#111114', '#46627f'];
export const SEAT_LIGHT = ['#ffd9a8', '#9a9aa3', '#c5d6e6'];
export const SEAT_NAME = ['치즈냥', '턱시도냥', '고등어냥'];

export const TERRAIN = {
  empty: { name: '골목길', fill: '#e6dccb' },
  fertile: { name: '햇볕 자리', fill: '#ffe08a' },
  pond: { name: '개울', fill: '#8fc9e6' },
  rock: { name: '공사장', fill: '#b9b9b9' },
};

/** 명당 9종. roots = 엔진 뿌리 모양(회전 0), tag = 소문 카드용 묶음 */
export const SPOTS = {
  oak: { name: '평상', bg: '#f1d49a', roots: [[0, 0, 2], [1, 0, 2], [-1, 0, 2]], tag: '아늑한 곳' },
  pine: { name: '종이 상자', bg: '#e7c39b', roots: [[0, 0, 3], [1, 0, 1], [-1, 0, 1]], tag: '아늑한 곳' },
  grass: { name: '화단', bg: '#c9e7ad', roots: [[0, 0, 2], [1, 0, 1], [1, -1, 1], [0, -1, 1]] },
  kudzu: { name: '쥐구멍', bg: '#e3d9cc', roots: [[0, 0, 1], [1, 0, 1], [2, 0, 2]] },
  fern: { name: '지붕', bg: '#f4c7b0', roots: [[0, 0, 2], [2, 0, 1], [0, -2, 1], [-2, 2, 1]] },
  dandelion: { name: '캣닢 화분', bg: '#d4efc4', roots: [[0, 0, 1], [1, 0, 1], [-1, 0, 1]], tag: '먹을거리', mark: '멀리 +1' },
  lotus: { name: '낚시꾼', bg: '#c4e4f4', roots: [[0, 0, 2], [1, 0, 1], [-1, 0, 1]], tag: '먹을거리', mark: '개울가' },
  mushroom: { name: '빗자루 할머니', bg: '#efe2cf', roots: [[0, 0, 2]], mark: '쫓기 −2' },
  mugunghwa: { name: '캣맘 급식소', bg: '#ffd6d6', roots: [[0, 0, 2], [1, 0, 1], [1, -1, 1]], tag: '먹을거리', mark: '+1점' },
};
export const SPOT_IDS = ['oak', 'pine', 'grass', 'kudzu', 'fern', 'dandelion', 'lotus', 'mushroom', 'mugunghwa'];

export const px = (q, r, R) => [R * SQ3 * (q + r / 2), R * 1.5 * r];
export function hexPoints(cx, cy, R) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k - 30) * Math.PI) / 180;
    pts.push(`${(cx + R * Math.cos(a)).toFixed(2)},${(cy + R * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
/** 회전 k 번(규칙의 회전: (dq,dr) → (−dr, dq+dr)) */
export function rot(dq, dr, k) {
  let q = dq;
  let r = dr;
  for (let i = 0; i < ((k % 6) + 6) % 6; i++) [q, r] = [-r, q + r];
  return [q, r];
}
const T = (x, y, size, text, { fill = '#2a2018', weight = 800, anchor = 'middle' } = {}) =>
  `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${size.toFixed(2)}" text-anchor="${anchor}" font-weight="${weight}" fill="${fill}" font-family="${FONT}">${text}</text>`;
export const text = T;

// ---------------------------------------------------------------------------
// 명당 아이콘 (중심 0,0, 크기 약 ±1). s = 배율
// ---------------------------------------------------------------------------
const ICON = {
  oak: `<rect x="-0.85" y="-0.35" width="1.7" height="0.5" rx="0.06" fill="#b9814a" stroke="#6b4423" stroke-width="0.06"/>
<path d="M-0.85,-0.18 h1.7 M-0.85,0 h1.7" stroke="#8a5a2e" stroke-width="0.04"/>
<rect x="-0.75" y="0.15" width="0.12" height="0.4" fill="#6b4423"/><rect x="0.63" y="0.15" width="0.12" height="0.4" fill="#6b4423"/>
<path d="M-0.3,-0.35 q0.1,-0.35 0.3,-0.3 q0.22,-0.05 0.3,0.3 z" fill="#f5f0e6" stroke="#6b4423" stroke-width="0.04"/>`,
  pine: `<path d="M-0.7,-0.2 L0,-0.5 L0.7,-0.2 L0,0.1 Z" fill="#e2b783" stroke="#7a5230" stroke-width="0.05"/>
<path d="M-0.7,-0.2 L0,0.1 L0,0.7 L-0.7,0.4 Z" fill="#c9965e" stroke="#7a5230" stroke-width="0.05"/>
<path d="M0.7,-0.2 L0,0.1 L0,0.7 L0.7,0.4 Z" fill="#b8844d" stroke="#7a5230" stroke-width="0.05"/>
<path d="M-0.28,-0.32 l0.06,-0.22 l0.12,0.14 M0.28,-0.32 l-0.06,-0.22 l-0.12,0.14" stroke="#3a2a1a" stroke-width="0.06" fill="#3a2a1a"/>`,
  grass: `<ellipse cx="0" cy="0.25" rx="0.8" ry="0.35" fill="#6fa64a"/>
<circle cx="-0.4" cy="0.05" r="0.16" fill="#ff8fa3"/><circle cx="0.05" cy="-0.1" r="0.16" fill="#ffd166"/><circle cx="0.45" cy="0.05" r="0.16" fill="#ff8fa3"/>
<circle cx="-0.4" cy="0.05" r="0.06" fill="#fff"/><circle cx="0.05" cy="-0.1" r="0.06" fill="#fff"/><circle cx="0.45" cy="0.05" r="0.06" fill="#fff"/>`,
  kudzu: `<path d="M-0.75,0.6 V-0.1 A0.75,0.75 0 0 1 0.75,-0.1 V0.6 Z" fill="#a89a88" stroke="#6d6253" stroke-width="0.05"/>
<path d="M-0.35,0.6 V0.1 A0.35,0.35 0 0 1 0.35,0.1 V0.6 Z" fill="#2b2420"/>
<path d="M0.3,0.5 q0.3,0 0.35,-0.25" stroke="#d98c8c" stroke-width="0.06" fill="none"/>`,
  fern: `<path d="M-0.85,0.15 L0,-0.6 L0.85,0.15 Z" fill="#d9614a" stroke="#8e3424" stroke-width="0.06"/>
<path d="M-0.55,-0.1 h1.1 M-0.3,-0.33 h0.6" stroke="#8e3424" stroke-width="0.05"/>
<rect x="-0.6" y="0.15" width="1.2" height="0.45" fill="#f5e6c8" stroke="#8e3424" stroke-width="0.05"/>
<rect x="-0.15" y="0.3" width="0.3" height="0.3" fill="#8a5a2e"/>`,
  dandelion: `<path d="M-0.4,0.15 h0.8 l-0.12,0.5 h-0.56 z" fill="#d9744a" stroke="#8e4424" stroke-width="0.05"/>
<path d="M0,0.15 q-0.5,-0.3 -0.35,-0.7 q0.2,0.2 0.35,0.7 q0.05,-0.5 0.3,-0.75 q0.15,0.4 -0.3,0.75 q0.45,-0.2 0.55,-0.45 q0,0.35 -0.55,0.45" fill="#5fae4a" stroke="#2e6b22" stroke-width="0.04"/>`,
  lotus: `<path d="M-0.55,0.1 q0.35,-0.45 0.8,0 q-0.45,0.45 -0.8,0 z" fill="#5b8fc7" stroke="#2c5a8a" stroke-width="0.05"/>
<path d="M0.25,0.1 l0.35,-0.25 v0.5 z" fill="#5b8fc7" stroke="#2c5a8a" stroke-width="0.05"/>
<circle cx="-0.32" cy="0.02" r="0.05" fill="#fff"/>
<path d="M-0.7,-0.7 q0.5,0.1 0.9,0.5" stroke="#6b4423" stroke-width="0.06" fill="none"/><path d="M0.2,-0.2 v0.15" stroke="#555" stroke-width="0.03"/>`,
  mushroom: `<path d="M0.55,-0.75 L-0.25,0.25" stroke="#8a5a2e" stroke-width="0.12" stroke-linecap="round"/>
<path d="M-0.25,0.25 l-0.45,0.35 l0.35,0.1 l0.25,-0.05 l0.2,-0.25 z" fill="#e8c35a" stroke="#9a7a22" stroke-width="0.05"/>
<path d="M-0.55,0.55 l0.1,-0.15 M-0.4,0.6 l0.1,-0.2 M-0.25,0.6 l0.08,-0.22" stroke="#9a7a22" stroke-width="0.04"/>`,
  mugunghwa: `<ellipse cx="0" cy="0.3" rx="0.7" ry="0.22" fill="#e65f7a" stroke="#9a2e44" stroke-width="0.05"/>
<path d="M-0.7,0.3 q0.7,0.45 1.4,0" fill="#c94862"/>
<circle cx="-0.2" cy="0.2" r="0.08" fill="#a86b3c"/><circle cx="0.05" cy="0.15" r="0.08" fill="#a86b3c"/><circle cx="0.28" cy="0.22" r="0.08" fill="#a86b3c"/>
<path d="M0,-0.15 c-0.25,-0.35 -0.6,-0.05 0,0.25 c0.6,-0.3 0.25,-0.6 0,-0.25 z" fill="#ff5c7a"/>`,
};
export function icon(id, x, y, s) {
  return `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${s.toFixed(3)})">${ICON[id]}</g>`;
}

// ---------------------------------------------------------------------------
// 명당 타일
// ---------------------------------------------------------------------------
/**
 * 명당 타일 (cx, cy 중심, 반지름 R). rotation = 규칙의 회전 수(타일을 돌려 놓은 방향).
 * 가운데 원 = 놓은 칸에 모이는 고양이 수, 변 쪽 발바닥 원 = 그 방향 옆 칸, 노란 원 »n = 그 방향 두 칸 앞.
 */
export function spotTile(id, cx, cy, R, { rotation = 0, label = true, compact = false } = {}) {
  const sp = SPOTS[id];
  const out = [];
  out.push(`<polygon points="${hexPoints(cx, cy, R)}" fill="${sp.bg}" stroke="#4a3a28" stroke-width="${R * 0.05}"/>`);
  out.push(`<polygon points="${hexPoints(cx, cy, R * 0.9)}" fill="none" stroke="#fffaf0" stroke-width="${R * 0.03}" opacity="0.9"/>`);
  out.push(icon(id, cx, cy - R * 0.2, R * 0.38));
  const badge = (x, y, n, far) => {
    const rr = R * (far ? 0.19 : 0.17);
    out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rr.toFixed(2)}" fill="${far ? '#ffe066' : '#ffffff'}" stroke="#3b2f1a" stroke-width="${(R * 0.03).toFixed(2)}"/>`);
    out.push(T(x, y + rr * 0.4, rr * 1.15, far ? `»${n}` : `${n}`));
  };
  let center = 0;
  for (const [dq0, dr0, n] of sp.roots) {
    const [dq, dr] = rot(dq0, dr0, rotation);
    if (dq === 0 && dr === 0) {
      center = n;
      continue;
    }
    const [x, y] = px(dq, dr, 1);
    const len = Math.hypot(x, y);
    const far = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 2;
    const d = R * 0.66;
    badge(cx + (x / len) * d, cy + (y / len) * d, n, far);
  }
  // 가운데 고양이 수: 고양이 얼굴 배지
  const cr = R * 0.2;
  const by = cy + R * (compact ? 0.32 : 0.26);
  out.push(`<path d="M${cx - cr * 0.9},${by - cr * 0.55} l${cr * 0.15},${-cr * 0.75} l${cr * 0.5},${cr * 0.45} M${cx + cr * 0.9},${by - cr * 0.55} l${-cr * 0.15},${-cr * 0.75} l${-cr * 0.5},${cr * 0.45}" fill="#3b2f1a" stroke="#3b2f1a" stroke-width="${cr * 0.12}"/>`);
  out.push(`<circle cx="${cx}" cy="${by}" r="${cr}" fill="#3b2f1a"/>`);
  out.push(T(cx, by + cr * 0.42, cr * 1.15, `${center}`, { fill: '#fff' }));
  if (label) {
    const t = sp.mark ? `${sp.name} · ${sp.mark}` : sp.name;
    out.push(T(cx, cy + R * 0.74, R * (t.length > 10 ? 0.105 : t.length > 7 ? 0.12 : 0.14), t, { fill: '#3b2f1a' }));
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// 고양이 토큰 (둥근 나무 토큰, 쌓는다)
// ---------------------------------------------------------------------------
export function catToken(cx, cy, r, seat) {
  return `<ellipse cx="${cx}" cy="${cy + r * 0.18}" rx="${r}" ry="${r * 0.62}" fill="${SEAT_DARK[seat]}" stroke="#1a1a1a" stroke-width="${r * 0.08}"/>
<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.62}" fill="${SEAT[seat]}" stroke="#1a1a1a" stroke-width="${r * 0.08}"/>
<path d="M${cx - r * 0.45},${cy - r * 0.05} l${r * 0.08},${-r * 0.32} l${r * 0.22},${r * 0.18} h${r * 0.3} l${r * 0.22},${-r * 0.18} l${r * 0.08},${r * 0.32} q0,${r * 0.36} ${-r * 0.45},${r * 0.36} q${-r * 0.45},0 ${-r * 0.45},${-r * 0.36} z" fill="${SEAT_LIGHT[seat]}" opacity="0.95"/>
<circle cx="${cx - r * 0.17}" cy="${cy + r * 0.05}" r="${r * 0.05}" fill="#1a1a1a"/><circle cx="${cx + r * 0.17}" cy="${cy + r * 0.05}" r="${r * 0.05}" fill="#1a1a1a"/>`;
}
/** 고양이 n 마리를 쌓은 모습 (cx, cy = 맨 아래 토큰 중심). 4마리 이상이면 숫자 표시를 붙인다 */
export function catStack(cx, cy, n, seat, r) {
  const out = [];
  const shown = Math.min(n, 5);
  for (let i = 0; i < shown; i++) out.push(catToken(cx, cy - i * r * 0.32, r, seat));
  if (n >= 3) {
    const bx = cx + r * 1.05;
    const by = cy - (shown - 1) * r * 0.32 - r * 0.2;
    out.push(`<circle cx="${bx}" cy="${by}" r="${r * 0.46}" fill="#fff" stroke="#1a1a1a" stroke-width="${r * 0.08}"/>`);
    out.push(T(bx, by + r * 0.2, r * 0.6, `${n}`));
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// 골목 보드
// ---------------------------------------------------------------------------
function terrainDeco(t, x, y, R) {
  if (t === 'pond')
    return `<path d="M${x - R * 0.45},${y - R * 0.05} q${R * 0.22},${-R * 0.16} ${R * 0.45},0 t${R * 0.45},0 M${x - R * 0.35},${y + R * 0.25} q${R * 0.17},${-R * 0.13} ${R * 0.35},0 t${R * 0.35},0" stroke="#e8f6fc" stroke-width="${R * 0.06}" fill="none"/>`;
  if (t === 'rock')
    return `<path d="M${x - R * 0.28},${y + R * 0.35} L${x},${y - R * 0.4} L${x + R * 0.28},${y + R * 0.35} Z" fill="#f28c28" stroke="#8a4a10" stroke-width="${R * 0.04}"/><path d="M${x - R * 0.18},${y + R * 0.08} h${R * 0.36} M${x - R * 0.1},${y - R * 0.12} h${R * 0.2}" stroke="#fff" stroke-width="${R * 0.08}"/><rect x="${x - R * 0.38}" y="${y + R * 0.33}" width="${R * 0.76}" height="${R * 0.1}" fill="#8a4a10"/>`;
  if (t === 'fertile') {
    let rays = '';
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      rays += `M${x + Math.cos(a) * R * 0.28},${y + Math.sin(a) * R * 0.28} L${x + Math.cos(a) * R * 0.42},${y + Math.sin(a) * R * 0.42} `;
    }
    return `<circle cx="${x}" cy="${y}" r="${R * 0.2}" fill="#ffb627"/><path d="${rays}" stroke="#ffb627" stroke-width="${R * 0.06}" stroke-linecap="round"/>`;
  }
  // 골목길: 보도블록 줄눈
  return `<path d="M${x - R * 0.55},${y - R * 0.2} h${R * 1.1} M${x - R * 0.55},${y + R * 0.2} h${R * 1.1} M${x - R * 0.2},${y - R * 0.6} v${R * 0.4} M${x + R * 0.25},${y - R * 0.2} v${R * 0.4} M${x - R * 0.2},${y + R * 0.2} v${R * 0.4}" stroke="#cfc3ad" stroke-width="${R * 0.04}"/>`;
}

function hideout(x, y, R, seat) {
  const s = R * 0.55;
  return `<polygon points="${hexPoints(x, y, R * 0.98)}" fill="${SEAT[seat]}" stroke="#1a1a1a" stroke-width="${R * 0.04}"/>
<path d="M${x - s * 0.7},${y + s * 0.55} v${-s * 0.55} l${s * 0.7},${-s * 0.6} l${s * 0.7},${s * 0.6} v${s * 0.55} z" fill="#fff8e6" stroke="#1a1a1a" stroke-width="${R * 0.04}"/>
<path d="M${x - s * 0.22},${y + s * 0.55} v${-s * 0.3} a${s * 0.22},${s * 0.22} 0 0 1 ${s * 0.44},0 v${s * 0.3} z" fill="${SEAT_DARK[seat]}"/>
${T(x, y + R * 0.78, R * 0.2, '아지트', { fill: seat === 1 ? '#fff' : '#1a1a1a' })}`;
}

/**
 * 보드. state = dump-state.ts 출력과 같은 모양({cells:[{q,r,terrain,tile,entrance,seat,count,plant,rotation}]}).
 * opts.labels {"q,r": 글자}, opts.marks {"q,r": 'ok'|'no'|색}, opts.only (그릴 칸 키 집합), opts.tileEdges(기본 true)
 */
export function board(state, R, opts = {}) {
  const cells = opts.only ? state.cells.filter((c) => opts.only.has(`${c.q},${c.r}`)) : state.cells;
  const byKey = new Map(state.cells.map((c) => [`${c.q},${c.r}`, c]));
  const pts = cells.map((c) => px(c.q, c.r, R));
  const pad = opts.pad ?? 1.25;
  const minX = Math.min(...pts.map((p) => p[0])) - R * pad;
  const maxX = Math.max(...pts.map((p) => p[0])) + R * pad;
  const minY = Math.min(...pts.map((p) => p[1])) - R * (pad + 0.1);
  const maxY = Math.max(...pts.map((p) => p[1])) + R * (pad + 0.1);
  const out = [];
  for (const c of cells) {
    const [x, y] = px(c.q, c.r, R);
    out.push(`<polygon points="${hexPoints(x + R * 0.05, y + R * 0.09, R * 1.02)}" fill="#3a2a17" opacity="0.28"/>`);
  }
  for (const c of cells) {
    const [x, y] = px(c.q, c.r, R);
    out.push(`<polygon points="${hexPoints(x, y, R)}" fill="${TERRAIN[c.terrain].fill}" stroke="#a89878" stroke-width="${R * 0.03}"/>`);
    if (c.entrance < 0 || c.entrance === undefined) out.push(terrainDeco(c.terrain, x, y, R));
  }
  if (opts.tileEdges !== false) {
    const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    for (const c of cells) {
      const [x, y] = px(c.q, c.r, R);
      DIRS.forEach(([dq, dr], d) => {
        const nb = byKey.get(`${c.q + dq},${c.r + dr}`);
        if (nb && nb.tile === c.tile && (!opts.only || opts.only.has(`${nb.q},${nb.r}`))) return;
        const a1 = ((-60 * d - 30) * Math.PI) / 180;
        const a2 = ((-60 * d + 30) * Math.PI) / 180;
        out.push(`<line x1="${(x + R * Math.cos(a1)).toFixed(2)}" y1="${(y + R * Math.sin(a1)).toFixed(2)}" x2="${(x + R * Math.cos(a2)).toFixed(2)}" y2="${(y + R * Math.sin(a2)).toFixed(2)}" stroke="#5a4630" stroke-width="${R * 0.09}" stroke-linecap="round"/>`);
      });
    }
  }
  for (const c of cells) {
    const [x, y] = px(c.q, c.r, R);
    if (c.entrance >= 0) out.push(hideout(x, y, R, c.entrance));
    if (c.plant) out.push(spotTile(c.plant, x, y, R * 0.88, { rotation: c.rotation ?? 0, label: opts.spotLabels ?? false, compact: !(opts.spotLabels ?? false) }));
  }
  for (const c of cells) {
    if (c.seat < 0 || !c.count) continue;
    const [x, y] = px(c.q, c.r, R);
    const r = R * 0.3;
    const ox = c.plant ? R * 0.38 : 0;
    const oy = c.plant ? R * 0.42 : R * 0.18;
    out.push(catStack(x + ox, y + oy, c.count, c.seat, r));
  }
  for (const c of cells) {
    const k = `${c.q},${c.r}`;
    const [x, y] = px(c.q, c.r, R);
    const m = opts.marks?.[k];
    if (m === 'ok') out.push(`<circle cx="${x}" cy="${y}" r="${R * 0.42}" fill="none" stroke="#1f9d55" stroke-width="${R * 0.12}"/>`);
    else if (m === 'no') out.push(`<path d="M${x - R * 0.32},${y - R * 0.32} L${x + R * 0.32},${y + R * 0.32} M${x + R * 0.32},${y - R * 0.32} L${x - R * 0.32},${y + R * 0.32}" stroke="#d33" stroke-width="${R * 0.12}" stroke-linecap="round"/>`);
    else if (m) out.push(`<polygon points="${hexPoints(x, y, R * 0.86)}" fill="none" stroke="${m}" stroke-width="${R * 0.12}" stroke-dasharray="${R * 0.22},${R * 0.12}"/>`);
    if (opts.labels?.[k]) {
      const lx = x - R * 0.52;
      const ly = y - R * 0.48;
      out.push(`<circle cx="${lx}" cy="${ly}" r="${R * 0.24}" fill="#c0392b" stroke="#fff" stroke-width="${R * 0.04}"/>${T(lx, ly + R * 0.09, R * 0.26, opts.labels[k], { fill: '#fff' })}`);
    }
  }
  return { svg: out.join('\n'), bbox: [minX, minY, maxX - minX, maxY - minY] };
}

export function wrap(inner, [x, y, w, h], width) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" width="${width}" height="${((width * h) / w).toFixed(1)}">${inner}</svg>`;
}
