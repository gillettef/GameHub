/**
 * 소문 카드 16장 (엔진 목표 id 그대로, 이름·문구만 고양이 테마). 점수는 notes/Rules.md 8절과 같다.
 */
import { icon, text } from './draw.mjs';

export const GOALS = [
  { id: 'pond-side', name: '개울가 산책', rule: '개울과 맞닿은\n내 칸 1칸당', pts: '+1', glyph: 'pond' },
  { id: 'big-garden', name: '가장 넓은 영역', rule: '이어진 내 칸 중\n가장 큰 덩어리', pts: '+4 / +2', sub: '1등 / 2등', glyph: 'blob' },
  { id: 'long-path', name: '쭉 뻗은 골목', rule: '한 직선으로 이어진\n내 칸의 가장 긴 줄', pts: '+4 / +2', sub: '1등 / 2등', glyph: 'line' },
  { id: 'fertile-field', name: '양지바른 곳', rule: '햇볕 자리인\n내 칸 1칸당', pts: '+2', glyph: 'sun' },
  { id: 'edge-fence', name: '동네 어귀', rule: '보드 가장자리인\n내 칸 1칸당', pts: '+1', glyph: 'edge' },
  { id: 'center-plaza', name: '동네 한복판', rule: '가운데 조각 7칸 중\n내 칸이 가장 많으면', pts: '+4', glyph: 'center' },
  { id: 'every-tile', name: '온 동네 마실', rule: '내 칸이 있는\n조각 1장당', pts: '+1', glyph: 'tiles' },
  { id: 'flower-bed', name: '맛집 골목', rule: '내 영역 위\n먹을거리 1개당', pts: '+2', spots: ['dandelion', 'lotus', 'mugunghwa'] },
  { id: 'forest', name: '아늑한 아지트', rule: '맞닿은 아늑한 곳\n3개 이상 무리마다', pts: '+4', spots: ['oak', 'pine'] },
  { id: 'variety', name: '명당 수집가', rule: '내 영역 위 명당이\n5종 이상이면', pts: '+4', glyph: 'five' },
  { id: 'pine-reserve', name: '상자 단골', rule: '내 영역 위\n종이 상자 1개당', pts: '+2', spots: ['pine'], reserve: true },
  { id: 'kudzu-reserve', name: '쥐구멍 단골', rule: '내 영역 위\n쥐구멍 1개당', pts: '+2', spots: ['kudzu'], reserve: true },
  { id: 'fern-reserve', name: '지붕 단골', rule: '내 영역 위\n지붕 1개당', pts: '+2', spots: ['fern'], reserve: true },
  { id: 'grass-reserve', name: '화단 단골', rule: '내 영역 위\n화단 1개당', pts: '+2', spots: ['grass'], reserve: true },
  { id: 'mushroom-reserve', name: '할머니 단골', rule: '내 영역 위\n빗자루 할머니 1개당', pts: '+2', spots: ['mushroom'], reserve: true },
  { id: 'dandelion-reserve', name: '캣닢 단골', rule: '내 영역 위\n캣닢 화분 1개당', pts: '+2', spots: ['dandelion'], reserve: true },
];
const BY = new Map(GOALS.map((g) => [g.id, g]));

function glyph(kind, cx, cy, s) {
  const hex = (x, y, f) => {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = ((60 * k - 30) * Math.PI) / 180;
      pts.push(`${(x + s * 0.2 * Math.cos(a)).toFixed(1)},${(y + s * 0.2 * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${f}" stroke="#5a4630" stroke-width="${s * 0.02}"/>`;
  };
  const w = s * 0.2 * Math.sqrt(3);
  const h = s * 0.3;
  const at = (q, r) => [cx + w * (q + r / 2), cy + h * r];
  const cat = '#f29a2e';
  const grid = (fill) => {
    let o = '';
    for (const [q, r] of [[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [-1, 1]]) o += hex(...at(q, r), fill(q, r));
    return o;
  };
  switch (kind) {
    case 'pond':
      return grid((q, r) => (q === 0 && r === 0 ? '#8fc9e6' : (q + r) % 2 ? cat : '#e6dccb'));
    case 'blob':
      return grid((q, r) => (q + r <= 0 || r === 0 ? cat : '#e6dccb'));
    case 'line':
      return grid((q, r) => (r === 0 ? cat : '#e6dccb'));
    case 'sun':
      return grid((q, r) => (q === 0 && r === 0 ? '#ffe08a' : q === 1 && r === -1 ? '#ffe08a' : '#e6dccb')) + hex(...at(0, 0), '#ffe08a');
    case 'edge':
      return grid((q, r) => (q === 0 && r === 0 ? '#e6dccb' : cat));
    case 'center':
      return grid((q, r) => (q === 0 && r === 0 ? cat : (q + 2 * r) % 3 === 0 ? cat : '#e6dccb'));
    case 'tiles':
      return grid((q, r) => (q === 0 && r === 0 ? cat : '#e6dccb'));
    case 'five':
      return `${text(cx, cy + s * 0.12, s * 0.42, '5종', { fill: '#3b2f1a' })}`;
    default:
      return '';
  }
}

/** 소문 카드 한 장 (x, y 왼쪽 위, w × h) */
export function goalCard(id, x, y, w, h) {
  const g = BY.get(id);
  const band = g.reserve ? '#4f9d5a' : '#c0692f';
  const o = [];
  o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.07}" fill="#fffaf0" stroke="#5a4630" stroke-width="${w * 0.02}"/>`);
  o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h * 0.17}" rx="${w * 0.07}" fill="${band}"/><rect x="${x}" y="${y + h * 0.1}" width="${w}" height="${h * 0.07}" fill="${band}"/>`);
  o.push(text(x + w / 2, y + h * 0.12, Math.min(w * 0.13, (w * 0.86) / g.name.length), g.name, { fill: '#fff' }));
  const cy = y + h * 0.4;
  if (g.spots) {
    const n = g.spots.length;
    g.spots.forEach((sp, i) => o.push(icon(sp, x + w * ((i + 0.5) / n), cy, w * (n > 2 ? 0.13 : n > 1 ? 0.17 : 0.24))));
  } else o.push(glyph(g.glyph, x + w / 2, cy, w * 0.62));
  g.rule.split('\n').forEach((line, i) => o.push(text(x + w / 2, y + h * (0.67 + i * 0.09), Math.min(w * 0.085, (w * 0.9) / line.length), line, { fill: '#3b2f1a', weight: 600 })));
  o.push(text(x + w / 2, y + h * 0.93, w * 0.15, g.pts, { fill: band }));
  return o.join('');
}
